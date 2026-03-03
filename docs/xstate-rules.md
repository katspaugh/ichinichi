# XState Rules (vault/auth only)

XState is only used for vault/auth flows. For new hook orchestration, use Zustand stores.

1. **No dot-path targets → use #id targets**
2. **No sendTo("id") → system.get() actor refs**
3. **Inline actions/guards preferred; setup() maps only for reuse**
