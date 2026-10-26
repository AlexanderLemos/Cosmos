# COSMOS

Toda ideia nasce no Caos. O Cosmos é a ordem que você dá a ela.

Projeto local-first de conhecimento em Markdown e memória de projetos compartilhada
entre agentes. Alvos: **Web e Desktop (Tauri 2)**. Código próprio sob [MIT](LICENSE).

**Estado atual: núcleo funcional inicial de F1.** Web e Desktop permitem abrir,
editar, salvar e buscar notas Markdown, com modos de leitura e edição dividida.
O Desktop usa `cosmosd` e cria documentos
de projeto, permite mover notas, oferece lixeira com restauração e acompanha
alterações externas preservando rascunhos; a Web oferece cofre local, importação de pasta/ZIP e exportação ZIP.
A busca atualiza o índice por revisão em ambas as plataformas, preservando as entradas inalteradas.
Web e Desktop também guardam rascunhos locais confirmados e permitem recuperá-los sem sobrescrever a nota original.
O comando **Salvar cópia como…** grava o texto atual em uma nova nota, inclusive após conflito ou remoção da origem, mantendo a edição aberta.
Veja [o que já funciona e os limites de F1](docs/fase-1.md).
O [plano completo](docs/plan/COSMOS_Plano_Mestre_v2.2_Consolidado.md) continua sendo
a referência; as [pendências de F0](docs/fase-0.md) permanecem explícitas.

## Desenvolvimento

Node **24.19.0**, pnpm **11.25.0**, Rust **1.99.1** (rustfmt + clippy).
Em uma máquina comum, instale os [pré-requisitos nativos oficiais do Tauri](https://v2.tauri.app/start/prerequisites/).
No Linux Debian/Ubuntu são necessários GTK 3, WebKitGTK 4.1 e suas bibliotecas de desenvolvimento.

```bash
pnpm install --frozen-lockfile
pnpm daemon:build        # necessário antes de Cargo/Tauri
pnpm dev                 # Web
pnpm dev:desktop         # Tauri em desktop com ambiente gráfico e libs nativas
```

No **ambiente cloud Debian 13 deste projeto**:

```bash
cd /workspace/Cosmos
bash scripts/cloud/install.sh
source /workspace/.cosmos-tools/env.sh  # em cada shell novo
pnpm dev
```

O bootstrap mantém Rust, caches e bibliotecas nativas em `/workspace/.cosmos-tools`,
sem modificar `/usr`. Os detalhes do teste nativo estão em [ambiente.md](docs/ambiente.md).
Cada tarefa cloud já é isolada: use este checkout; não crie worktree sem solicitação.

## Verificação

```bash
pnpm check              # lint, tipos, Vitest e ausência de divergência de schemas
pnpm build              # shells Web e Desktop frontend
pnpm test:e2e           # Chromium: render, idioma, tema e axe
cargo test --workspace --locked
cargo test -p cosmos-daemon --features fault-injection --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
pnpm --filter desktop tauri build --debug --no-bundle
```

Os testes de conformidade iniciais comparam títulos/links Markdown usando os mesmos
fixtures em TS e Rust. Ainda não provam toda a compatibilidade Obsidian.
`tests/conformance` fica fora do formatador para preservar os casos de entrada.

Após editar contratos em `crates/cosmos-core`, execute `pnpm schemas:generate` e
revise o diff. Não edite `packages/schemas/json` ou `src/generated.ts` à mão.

A CI define builds em Linux, Windows e macOS. Publicação, assinaturas e releases
não estão configuradas nesta etapa. O projeto não precisa de conta externa ou API
paga para desenvolver e executar os shells locais.
