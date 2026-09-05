# Use scoped bearer credentials for V1 agents

V1 external agents will authenticate with named bearer credentials whose secrets are shown once and stored only as hashes. Each credential has explicit application scopes and can be revoked independently. REST endpoints and the stateless MCP facade call the same application services; a full OAuth authorization flow is deferred until broader third-party client compatibility justifies it.
