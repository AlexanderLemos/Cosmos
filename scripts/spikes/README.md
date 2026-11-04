# Spikes da Fase 0

Experimentos que validam suposições do plano (§25, F0) **antes** de escrever os adaptadores.
Alguns só podem rodar na sua máquina, porque dependem do Windows real e dos agentes instalados.

| Spike | O que valida | Onde roda | Estado |
|---|---|---|---|
| S1 | `cosmosd` como sidecar + autostart por usuário (Win/Mac/Linux) | Sua máquina | Fica para a F3 (Desktop v0, ADR 0001) |
| **S2** | **Payloads reais dos hooks** de Claude Code, Codex e Hermes | **Sua máquina** | **Pronto para rodar** |
| S3 | SQLite-WASM + FTS5 + OPFS em 3 navegadores | CI | Fica para a F5 (Web, ADR 0001) |
| **S4** | **Escrita atômica com arquivo bloqueado no Windows** | **Sua máquina** | **Pronto para rodar** |
| S5 | `rmcp` stdio → IPC | Container/CI | Entra no início da F1 |

## Obter o `cosmos`

Opção 1, sem instalar Rust: baixe o artefato **cosmos-Windows** da última execução do CI em
<https://github.com/AlexanderLemos/Cosmos/actions> e coloque `cosmos.exe` numa pasta do `PATH`.

Opção 2, com Rust instalado:

```powershell
cargo install --path crates/cosmos-cli
```

Confira com `cosmos --version`.

## S2 · Capturar os payloads dos hooks

O comando `cosmos spike capture-hook` lê o JSON que o agente manda pelo stdin e salva em
uma pasta local. Ele **não imprime nada no stdout**, então não injeta nada no agente.

> Os payloads podem conter seus prompts. Eles ficam só na pasta que você escolher e nunca
> são enviados para lugar nenhum. Revise antes de compartilhar qualquer arquivo.

### Claude Code

1. Crie uma pasta de teste (não use um projeto real), por exemplo `C:\cosmos-spike`.
2. Copie [`claude-code-settings.json`](claude-code-settings.json) para
   `C:\cosmos-spike\.claude\settings.local.json` e ajuste `COSMOS_SPIKE_DIR` para uma pasta sua.
3. Abra o Claude Code dentro de `C:\cosmos-spike` e faça uma sessão curta que passe por tudo:
   - mande um pedido (UserPromptSubmit);
   - peça para criar e editar um arquivo e rodar um comando (PostToolUse);
   - rode `/compact` (PreCompact);
   - deixe ele responder (Stop) e depois saia com `/exit` (SessionEnd).
4. Abra a pasta configurada: haverá um `.json` por evento em `claude-code/`.

Assim a configuração fica só na pasta de teste e não mexe no seu `~/.claude/settings.json`.

### Codex e Hermes Agent

Use o mesmo comando, trocando `--harness` e `--event`:

```text
cosmos spike capture-hook --harness codex --event SessionStart
cosmos spike capture-hook --harness hermes-agent --event on_session_start
```

O formato de configuração dos hooks muda entre versões. Configure seguindo a documentação
oficial da versão instalada (links no plano, §29) e anote a versão (`codex --version`,
`hermes --version`). Eventos a cobrir:

- **Codex:** `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PreCompact`, `Stop`, `SessionEnd`.
- **Hermes:** `on_session_start`, `pre_llm_call`, `post_tool_call`, `post_llm_call`,
  `on_session_end`, `on_session_finalize`.

### O que devolver

Compacte a pasta de saída **depois de revisar** e me envie (ou faça commit em
`tests/agents/payloads/<harness>/<versão>/` removendo qualquer conteúdo pessoal). Com isso
eu escrevo os adaptadores e os testes de replay (§26) a partir de dados reais.

## S4 · Escrita atômica com arquivo bloqueado (Windows)

Rode no PowerShell, na raiz do repositório:

```powershell
.\scripts\spikes\s4-locked-file.ps1
```

O script bloqueia um arquivo de forma exclusiva (como um antivírus ou editor faria) e testa:

1. **Bloqueio curto (2 s):** a escrita deve esperar e **concluir**.
2. **Bloqueio longo (10 s):** a escrita deve **desistir em ~5 s** com erro "locked", sem
   corromper nem apagar o arquivo original.

Me envie a saída do script.
