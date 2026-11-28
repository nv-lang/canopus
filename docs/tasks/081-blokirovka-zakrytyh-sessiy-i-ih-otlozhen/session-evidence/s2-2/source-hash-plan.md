# Plan: author-source immutability

**Inputs/expected before hashing:** author files must remain unchanged from the values stated in the initiating task: `spec.md` 12,258 bytes / SHA-256 `2b56bfb8aed137548e0a4bb1c67d027447d5016f0b07f42f4c7980fcbb749e93`; `analysis.md` 15,183 bytes / SHA-256 `645ff6bb2f32dcdb064b4fe5c68145d9db97d0f5b335bb8a3034b8e4a9ee7bf3`; `spec-trace.md` 6,134 bytes / SHA-256 `e7ccec5cf8c7ac41f34957d71684d2a2d72162b9696d92c5f6e6bf7e9516bdb7`. Also hash prior report and prior session evidence to prove they remain present, not to infer their correctness.

**Method:** Python `pathlib` read-bytes and SHA-256, cwd task worktree; report only relative filenames, sizes, hashes and equality booleans. No payload printed or written back.
