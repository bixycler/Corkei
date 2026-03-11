# Gemini API Configuration Lessons Learned

During the integration of the temperature slider and thinking configuration in Corkei, we encountered several non-obvious pitfalls regarding how the `@google/genai` (Unified SDK) processes requests compared to the raw REST API.

## 1. The "Convergence" Problem: `config` vs REST
The naming confusion is even deeper because the SDK's `config` object is not just a renamed `generationConfig`. It acts as a **convergence point** for two different levels of the REST API:

1.  **Top-level REST siblings**: `systemInstruction` and `tools`.
2.  **Nested REST children**: Everything inside `generationConfig` (like `temperature`, `topP`, `thinkingConfig`).

In the REST API, these are siblings and children:
```json
{
  "systemInstruction": { ... }, // Top-level
  "generationConfig": {         // Nested
    "temperature": 0.0,
    "thinkingConfig": { ... }
  }
}
```

In the **`@google/genai` SDK**, they are all "squashed" onto the same level inside `config`:
```typescript
{
  config: {
    systemInstruction: { ... }, // Mapped to top-level REST
    temperature: 0.0,           // Mapped into REST generationConfig
    thinkingConfig: { ... }     // Mapped into REST generationConfig
  }
}
```

## 2. The Anatomy of Failure
Because `config` contains fields that belong to different REST layers, it's easy to make structural mistakes:

### ❌ Failure 1: The "Direct Port"
Trying to use the REST-style `generationConfig` key name inside the SDK's `config` block.
```typescript
// Result: generationConfig field is ignored by the SDK
request.config = {
  generationConfig: { // WRONG: SDK doesn't recognize this key
    temperature: 0.0 
  }
};
```

### ❌ Failure 2: The "Layer Collision"
Placing `systemInstruction` at the same level as a nested `generationConfig` object (incorrectly assuming only generation params were moved).
```typescript
// Result: systemInstruction works, but temperature is lost
request.config = {
  systemInstruction: { ... },
  generationConfig: { temperature: 0.0 } // WRONG: ignored
};
```

### ❌ Failure 3: Partial Unwrapping
Moving `thinkingConfig` out of the nest (which is correct), but leaving `temperature` and others inside a `generationConfig` object.
```typescript
// Result: thinkingConfig works, but temperature is lost
request.config = {
  generationConfig: { temperature: 0.0 }, // WRONG: temperature must be flat
  thinkingConfig: { ... } // RIGHT: correctly placed at SDK level
};
```

### ✅ Correct: All Configuration Fields Flat inside `config`
The final successful approach: move **all configuration fields** (from both the REST top-level and the REST `generationConfig` block) directly into the SDK's `config` object.
```typescript
// Result: CORRECT REST payload (SDK maps these fields back to "generationConfig")
ai.models.generateContent({
  model: '...',
  contents: [...], // Top-level param (remains outside config)
  config: {
    temperature: 0.5,
    maxOutputTokens: 2048,
    thinkingConfig: { ... },
    systemInstruction: { ... }
  }
});
```

## 3. Inherent Non-Determinism
Even when the configuration is correctly transmitted (verifiable via the "Network" tab showing `temperature: 0`), the model remains non-deterministic.
- **Floating Point Math**: GPU parallelization leads to tiny rounding variances.
- **Cloud Infrastructure**: Routing to different physical shards.
- **Mixture of Experts**: Dynamic routing paths in models like Gemini Flash.

## 4. Summary of Mapping
| Entity | REST API Key | SDK Key (`@google/genai`) |
| :--- | :--- | :--- |
| Config Object | `generationConfig` | `config` |
| System Prompt | `systemInstruction` | `config.systemInstruction` |
| Thinking Config | `generationConfig.thinkingConfig` | `config.thinkingConfig` |
| Temperature | `generationConfig.temperature` | `config.temperature` |
