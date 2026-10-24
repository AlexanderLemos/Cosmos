//! Timed overlapped I/O: PIPE_NOWAIT cannot reliably make progress on large writes.
use interprocess::local_socket::Stream;
use std::{
    io,
    os::windows::io::{AsHandle, AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
    time::Instant,
};
use windows_sys::Win32::{
    Foundation::{ERROR_IO_PENDING, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    Storage::FileSystem::{ReadFile, WriteFile},
    System::{
        IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED},
        Threading::{CreateEventW, WaitForSingleObject},
    },
};

fn transfer(
    stream: &Stream,
    deadline: Instant,
    start: impl FnOnce(HANDLE, *mut OVERLAPPED) -> i32,
) -> io::Result<usize> {
    let Stream::NamedPipe(pipe) = stream;
    let handle = pipe.as_handle();
    let raw = handle.as_raw_handle();
    // Interprocess opens its named-pipe handles with FILE_FLAG_OVERLAPPED.
    // The event is owned locally; the stack OVERLAPPED and caller's buffer stay
    // alive until completion, including cancellation on every timeout/error path.
    unsafe {
        let event = CreateEventW(ptr::null(), 1, 0, ptr::null());
        if event.is_null() {
            return Err(io::Error::last_os_error());
        }
        let event = OwnedHandle::from_raw_handle(event);
        let mut overlapped: OVERLAPPED = std::mem::zeroed();
        overlapped.hEvent = event.as_raw_handle();
        if start(raw, &mut overlapped) == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
                return Err(error);
            }
            let millis = deadline
                .saturating_duration_since(Instant::now())
                .as_millis();
            let timeout = u32::try_from(millis).unwrap_or(u32::MAX - 1);
            let wait = WaitForSingleObject(event.as_raw_handle(), timeout);
            if wait != WAIT_OBJECT_0 {
                let error = if wait == WAIT_TIMEOUT {
                    io::Error::new(io::ErrorKind::TimedOut, "IPC timeout")
                } else {
                    io::Error::last_os_error()
                };
                CancelIoEx(raw, &overlapped);
                let mut ignored = 0;
                // Cancellation may race completion. Always join before releasing
                // the operation's buffer or OVERLAPPED structure.
                GetOverlappedResult(raw, &overlapped, &mut ignored, 1);
                return Err(error);
            }
        }
        let mut count = 0;
        if GetOverlappedResult(raw, &overlapped, &mut count, 0) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(count as usize)
    }
}

pub fn read(stream: &Stream, bytes: &mut [u8], deadline: Instant) -> io::Result<usize> {
    transfer(stream, deadline, |handle, overlapped| unsafe {
        ReadFile(
            handle,
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            ptr::null_mut(),
            overlapped,
        )
    })
}

pub fn write(stream: &Stream, bytes: &[u8], deadline: Instant) -> io::Result<usize> {
    let result = transfer(stream, deadline, |handle, overlapped| unsafe {
        WriteFile(
            handle,
            bytes.as_ptr(),
            bytes.len() as u32,
            ptr::null_mut(),
            overlapped,
        )
    });
    if result.is_ok() {
        let Stream::NamedPipe(pipe) = stream;
        // Direct Win32 writes bypass interprocess's normal dirty tracking.
        // Preserve its flush-on-drop behavior so the final reply is not lost.
        pipe.inner().mark_dirty();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use interprocess::local_socket::prelude::*;
    use std::{sync::mpsc, thread, time::Duration};

    #[test]
    fn timed_out_read_is_cancelled_before_reusing_the_stream() {
        let temp = tempfile::tempdir().unwrap();
        let listener = crate::listener(temp.path()).unwrap();
        let (ready, wait) = mpsc::channel();
        thread::scope(|scope| {
            let server = scope.spawn(|| {
                let stream = listener.accept().unwrap();
                let mut byte = [0];
                let error = read(
                    &stream,
                    &mut byte,
                    Instant::now() + Duration::from_millis(20),
                )
                .unwrap_err();
                assert_eq!(error.kind(), io::ErrorKind::TimedOut);
                ready.send(()).unwrap();
                assert_eq!(
                    read(&stream, &mut byte, Instant::now() + Duration::from_secs(5)).unwrap(),
                    1
                );
                assert_eq!(byte, [42]);
            });
            let stream = crate::connect(temp.path()).unwrap();
            wait.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(
                write(&stream, &[42], Instant::now() + Duration::from_secs(5)).unwrap(),
                1
            );
            server.join().unwrap();
        });
    }
}
