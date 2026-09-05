# Use a Cloudflare-first runtime

V1 will use TanStack Start on Cloudflare Workers, D1 for relational data, R2 for private artifact storage, and Workflows for durable multi-step operations. LaTeX compilation is the exception: a separate Worker-backed Container provides the required security, resource, and deployment boundary. This keeps the main application simple while avoiding a second infrastructure provider; the lower-level Container API is preferred over the still-changing Sandbox SDK.
