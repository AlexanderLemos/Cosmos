use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::io::Read;

const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

fn extension(path: &str) -> Option<&str> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}
fn signature(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}
fn excluded(part: &str) -> bool {
    let part = part.to_ascii_lowercase();
    part.starts_with(".cosmos") || matches!(part.as_str(), ".git" | ".obsidian")
}

impl Vault {
    pub(super) fn list_images(&self) -> Result<Vec<String>> {
        fn walk(vault: &Vault, dir: &Path, paths: &mut Vec<String>) -> Result<()> {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let kind = entry.file_type()?;
                let name = entry.file_name();
                let Some(name) = name.to_str() else {
                    continue;
                };
                if kind.is_symlink() || name.contains('\\') || excluded(name) {
                    continue;
                }
                let path = entry
                    .path()
                    .strip_prefix(&vault.root)
                    .map_err(|_| Error::InvalidPath)?
                    .to_string_lossy()
                    .replace('\\', "/");
                // Skip names outside the portable grammar, including reserved directories.
                if vault.resolve(&path).is_err() {
                    continue;
                }
                if kind.is_dir() {
                    walk(vault, &entry.path(), paths)?;
                } else if kind.is_file() && extension(&path).is_some() {
                    paths.push(path);
                }
            }
            Ok(())
        }
        let mut paths = Vec::new();
        walk(self, &self.root, &mut paths)?;
        paths.sort();
        Ok(paths)
    }

    pub(super) fn read_image(&self, path: &str) -> Result<VaultReply> {
        if path.split('/').any(excluded) {
            return Err(Error::InvalidPath);
        }
        let target = self.resolve(path)?;
        let media_type = extension(path).ok_or(Error::UnsupportedImage)?;
        let metadata = fs::symlink_metadata(&target)?;
        if !metadata.is_file() {
            return Err(Error::InvalidPath);
        }
        if metadata.len() > MAX_IMAGE_BYTES as u64 {
            return Err(Error::ImageTooLarge);
        }
        let file = File::open(&target)?;
        if !file.metadata()?.is_file() {
            return Err(Error::InvalidPath);
        }
        // Bound the actual read as well as metadata, even if an external writer grows the file.
        let mut bytes = Vec::new();
        file.take((MAX_IMAGE_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(Error::ImageTooLarge);
        }
        if signature(&bytes) != Some(media_type) {
            return Err(Error::UnsupportedImage);
        }
        Ok(VaultReply::Image {
            path: path.into(),
            media_type: media_type.into(),
            data_base64: STANDARD.encode(bytes),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_reads_are_bounded_read_only_and_reject_unsafe_paths_and_formats() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("vault");
        let mut vault = Vault::open(&root, &temp.path().join("data")).unwrap();
        let png = include_bytes!("../../../tests/fixtures/images/pixels.png");
        fs::create_dir(root.join("assets")).unwrap();
        fs::write(root.join("assets/pixels.PNG"), png).unwrap();
        fs::write(root.join("note.md"), b"![[pixels.PNG]]\r\n").unwrap();
        fs::create_dir(root.join(".obsidian")).unwrap();
        fs::write(root.join(".obsidian/hidden.png"), png).unwrap();
        assert_eq!(vault.list_images().unwrap(), vec!["assets/pixels.PNG"]);
        let VaultReply::Image {
            media_type,
            data_base64,
            ..
        } = vault
            .execute(VaultCommand::ReadImage {
                path: "assets/pixels.PNG".into(),
            })
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(media_type, "image/png");
        assert_eq!(STANDARD.decode(data_base64).unwrap(), png);
        assert_eq!(fs::read(root.join("assets/pixels.PNG")).unwrap(), png);
        assert_eq!(
            fs::read(root.join("note.md")).unwrap(),
            b"![[pixels.PNG]]\r\n"
        );
        assert_eq!(
            vault
                .db
                .query_row("SELECT COUNT(*) FROM writes", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        for path in [
            "../pixels.png",
            "/pixels.png",
            "C:/pixels.png",
            "assets\\pixels.png",
            ".obsidian/hidden.png",
            ".OBSIDIAN/hidden.png",
            ".git/a.png",
            ".cosmos/trash/a.png",
            "CON.png",
            "assets/pixels.PNG:stream",
        ] {
            assert!(
                matches!(vault.read_image(path), Err(Error::InvalidPath)),
                "{path}"
            );
        }
        for (path, bytes) in [
            ("svg.png", b"<svg onload='alert(1)'/>".as_slice()),
            ("empty.png", b""),
            ("wrong.jpg", png.as_slice()),
            ("image.svg", png.as_slice()),
        ] {
            fs::write(root.join(path), bytes).unwrap();
            assert!(
                matches!(vault.read_image(path), Err(Error::UnsupportedImage)),
                "{path}"
            );
        }
        File::create(root.join("large.png"))
            .unwrap()
            .set_len((MAX_IMAGE_BYTES + 1) as u64)
            .unwrap();
        assert!(matches!(
            vault.read_image("large.png"),
            Err(Error::ImageTooLarge)
        ));
        fs::create_dir(root.join("directory.png")).unwrap();
        assert!(matches!(
            vault.read_image("directory.png"),
            Err(Error::InvalidPath)
        ));
        #[cfg(unix)]
        {
            fs::write(temp.path().join("outside.png"), png).unwrap();
            std::os::unix::fs::symlink(temp.path().join("outside.png"), root.join("linked.png"))
                .unwrap();
            std::os::unix::fs::symlink(temp.path(), root.join("linked-dir")).unwrap();
            assert!(matches!(
                vault.read_image("linked.png"),
                Err(Error::InvalidPath)
            ));
            assert!(matches!(
                vault.read_image("linked-dir/outside.png"),
                Err(Error::InvalidPath)
            ));
            assert!(
                !vault
                    .list_images()
                    .unwrap()
                    .iter()
                    .any(|path| path.starts_with("linked"))
            );
        }
    }

    #[test]
    fn signatures_and_extensions_must_match() {
        for (path, bytes, expected) in [
            ("a.png", b"\x89PNG\r\n\x1a\n".as_slice(), "image/png"),
            ("a.JPEG", b"\xff\xd8\xff".as_slice(), "image/jpeg"),
            ("a.gif", b"GIF87a".as_slice(), "image/gif"),
            ("a.webp", b"RIFF0000WEBP".as_slice(), "image/webp"),
        ] {
            assert_eq!(signature(bytes), Some(expected));
            assert_eq!(extension(path), Some(expected));
        }
        assert_eq!(signature(b"<html>"), None);
        assert_eq!(signature(b"GIF89a"), Some("image/gif"));
        assert_eq!(extension("a.svg"), None);
    }
}
