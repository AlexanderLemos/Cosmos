use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::io::Read;

const MAX_PDF_BYTES: usize = 16 * 1024 * 1024;

fn extension(path: &str) -> Option<&str> {
    path.to_ascii_lowercase()
        .ends_with(".pdf")
        .then_some("application/pdf")
}
fn signature(bytes: &[u8]) -> Option<&'static str> {
    ((bytes.starts_with(b"%PDF-1.") || bytes.starts_with(b"%PDF-2."))
        && bytes.get(7).is_some_and(u8::is_ascii_digit))
    .then_some("application/pdf")
}
fn excluded(part: &str) -> bool {
    let part = part.to_ascii_lowercase();
    part.starts_with(".cosmos") || matches!(part.as_str(), ".git" | ".obsidian")
}

impl Vault {
    pub(super) fn list_pdfs(&self) -> Result<Vec<String>> {
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

    pub(super) fn read_pdf(&self, path: &str) -> Result<VaultReply> {
        if path.split('/').any(excluded) {
            return Err(Error::InvalidPath);
        }
        let target = self.resolve(path)?;
        let media_type = extension(path).ok_or(Error::UnsupportedPdf)?;
        let metadata = fs::symlink_metadata(&target)?;
        if !metadata.is_file() {
            return Err(Error::InvalidPath);
        }
        if metadata.len() > MAX_PDF_BYTES as u64 {
            return Err(Error::PdfTooLarge);
        }
        let file = File::open(&target)?;
        if !file.metadata()?.is_file() {
            return Err(Error::InvalidPath);
        }
        // Bound the actual read as well as metadata, even if an external writer grows the file.
        let mut bytes = Vec::new();
        file.take((MAX_PDF_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_PDF_BYTES {
            return Err(Error::PdfTooLarge);
        }
        if signature(&bytes) != Some(media_type) {
            return Err(Error::UnsupportedPdf);
        }
        Ok(VaultReply::Pdf {
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
    fn pdf_reads_are_bounded_read_only_and_reject_unsafe_paths_and_formats() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("vault");
        let mut vault = Vault::open(&root, &temp.path().join("data")).unwrap();
        let pdf = include_bytes!("../../../tests/fixtures/pdfs/two-pages.pdf");
        fs::create_dir(root.join("assets")).unwrap();
        fs::write(root.join("assets/pixels.PDF"), pdf).unwrap();
        fs::write(root.join("note.md"), b"![[pixels.PDF]]\r\n").unwrap();
        fs::create_dir(root.join(".obsidian")).unwrap();
        fs::write(root.join(".obsidian/hidden.pdf"), pdf).unwrap();
        assert_eq!(vault.list_pdfs().unwrap(), vec!["assets/pixels.PDF"]);
        let VaultReply::Pdf {
            media_type,
            data_base64,
            ..
        } = vault
            .execute(VaultCommand::ReadPdf {
                path: "assets/pixels.PDF".into(),
            })
            .unwrap()
        else {
            panic!()
        };
        assert_eq!(media_type, "application/pdf");
        assert_eq!(STANDARD.decode(data_base64).unwrap(), pdf);
        assert_eq!(fs::read(root.join("assets/pixels.PDF")).unwrap(), pdf);
        assert_eq!(
            fs::read(root.join("note.md")).unwrap(),
            b"![[pixels.PDF]]\r\n"
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
            "../pixels.pdf",
            "/pixels.pdf",
            "C:/pixels.pdf",
            "assets\\pixels.pdf",
            ".obsidian/hidden.pdf",
            ".OBSIDIAN/hidden.pdf",
            ".git/a.pdf",
            ".cosmos/trash/a.pdf",
            "CON.pdf",
            "assets/pixels.PDF:stream",
        ] {
            assert!(
                matches!(vault.read_pdf(path), Err(Error::InvalidPath)),
                "{path}"
            );
        }
        for (path, bytes) in [
            ("svg.pdf", b"<svg onload='alert(1)'/>".as_slice()),
            ("empty.pdf", b""),
            ("wrong.jpg", pdf.as_slice()),
            ("image.svg", pdf.as_slice()),
        ] {
            fs::write(root.join(path), bytes).unwrap();
            assert!(
                matches!(vault.read_pdf(path), Err(Error::UnsupportedPdf)),
                "{path}"
            );
        }
        File::create(root.join("large.pdf"))
            .unwrap()
            .set_len((MAX_PDF_BYTES + 1) as u64)
            .unwrap();
        assert!(matches!(
            vault.read_pdf("large.pdf"),
            Err(Error::PdfTooLarge)
        ));
        fs::create_dir(root.join("directory.pdf")).unwrap();
        assert!(matches!(
            vault.read_pdf("directory.pdf"),
            Err(Error::InvalidPath)
        ));
        #[cfg(unix)]
        {
            fs::write(temp.path().join("outside.pdf"), pdf).unwrap();
            std::os::unix::fs::symlink(temp.path().join("outside.pdf"), root.join("linked.pdf"))
                .unwrap();
            std::os::unix::fs::symlink(temp.path(), root.join("linked-dir")).unwrap();
            assert!(matches!(
                vault.read_pdf("linked.pdf"),
                Err(Error::InvalidPath)
            ));
            assert!(matches!(
                vault.read_pdf("linked-dir/outside.pdf"),
                Err(Error::InvalidPath)
            ));
            assert!(
                !vault
                    .list_pdfs()
                    .unwrap()
                    .iter()
                    .any(|path| path.starts_with("linked"))
            );
        }
    }
}
