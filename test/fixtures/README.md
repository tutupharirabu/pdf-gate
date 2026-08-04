# PDF Fixtures

Real PDF test fixtures live at the **test/ root** (not in this folder):

- `test/Ijazah.pdf` — Indonesian university diploma (2.3 MB)
- `test/File Sertifikasi.pdf` — training certificate (414 KB)
- `test/Certificate_of_Completion - Softskills and Greenskills Training.pdf` (1.5 MB)

These files are **committed to the repository** (they were removed from
`.gitignore`) because the test suites and CI depend on them. Do not re-add
them to `.gitignore` — `npm test`, `npm run typecheck`, and the GitHub
Actions workflow all rely on them being present.
