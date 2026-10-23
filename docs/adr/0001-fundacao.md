# ADR 0001 — Fundação conforme Plano Mestre v2.2

Status: adotada para iniciar F0, 23/10/2026.

Referência: [plano integral](../plan/COSMOS_Plano_Mestre_v2.2_Consolidado.md), §§2, 6, 10, 22–26.

O repositório iniciou sem commits ou código. A implementação começa pela fundação,
com pnpm/Turborepo para TypeScript e Cargo workspace para Rust. Os shells React 19
de Web e Desktop compartilham UI, tokens e i18n. Desktop é Tauri 2, sem service worker.
Os módulos futuros serão criados quando tiverem implementação; diretórios vazios não
representam recursos entregues. O `cosmosd` e a CLI ainda não estão implementados.

O contrato inicial cobre projeto, vínculos, manifesto opcional, padrões de privacidade,
oito eventos e identificação de runtime. Rust é a fonte; JSON Schema e TypeScript
são gerados. Isso não encerra os contratos MCP/HTTP, nem implementa autorização,
redação de segredos ou o ciclo de vida das sessões. IDs e timestamps ainda precisam
de validação de domínio antes de uso na persistência. Os schemas são pré-release.

Regras de memória ficarão exclusivamente em `cosmos-memory`; UI e transportes
serão clientes. SQLite, logs e vínculos locais ficarão fora do vault. Markdown
continuará legível e nunca será reformatado por uma simples inspeção.

Todos os recursos que exigem consentimento começam desativados, inclusive captura.
Após autorização da captura, a primeira solicitação deverá ser preservada com
mascaramento; transcrições completas continuam desativadas. A presença de um manifesto
não concede acesso. `turn.completed` e `session.ended` são contratos diferentes.

O esboço §14.2 foi normalizado em `event: { type, payload }` dentro do envelope,
evitando `serde(flatten)` com rejeição de campos desconhecidos. É uma definição
inicial versionada, ainda sujeita à validação dos transportes em F0.

A identidade visual atual é um shell funcional, não uma proposta final aprovada.
Usa fontes do sistema até a curadoria OFL. Motion (MIT) permanece a alternativa
prevista; GSAP não foi incorporado e sua revisão de licença continua pendente.

Não há autostart, integração instalada em harness, HTTP local, escrita em Documentos
ou Mirror em Downloads. Essas capacidades terão consentimento e testes próprios.
