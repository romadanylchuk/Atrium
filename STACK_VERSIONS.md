# Stack Versions

| Package                    | Version | Pin Style                            | Rationale                                                                                |
| -------------------------- | ------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| electron                   | 41.2.1  | exact                                | Desktop runtime; exact pin prevents silent major bumps that change web platform behavior |
| react                      | ^19.2.0 | ^                                    | UI library; minor updates safe within major                                              |
| react-dom                  | ^19.2.0 | ^                                    | Paired with react; same policy                                                           |
| typescript                 | ^5.9.0  | ^                                    | Language tooling; patch/minor upgrades generally safe                                    |
| electron-vite              | ^3.0.0  | ^                                    | Build tooling; minor updates safe                                                        |
| vite                       | ^6.0.0  | ^                                    | Bundler; pinned to Vite 6 for electron-vite compatibility                                |
| vitest                     | ^3.0.0  | ^                                    | Test runner; minor updates safe                                                          |
| eslint                     | ^9.0.0  | ^                                    | Linter; pinned to ESLint 9 flat-config era                                               |
| prettier                   | ^3.0.0  | ^                                    | Formatter; minor updates safe                                                            |
| typescript-eslint          | ^8.0.0  | ^                                    | TS-aware lint rules; minor updates safe within v8                                        |
| @electron-toolkit/tsconfig | ^1.0.0  | ^                                    | Base tsconfig presets for Electron targets                                               |
| node (engines)             | 24.15.0 | exact (engines range: >=24.15.0 <25) | LTS; exact pin for runtime parity; see .nvmrc                                            |

## Rules

- **Native-addon deps** (`node-pty`, `@parcel/watcher`) will be exact-pinned when added in later stages.
- **Path aliases** are duplicated in `tsconfig.node.json`, `tsconfig.web.json`, and `electron.vite.config.ts` — all three must be updated together. See the mirror-warning comment at the top of each file.
