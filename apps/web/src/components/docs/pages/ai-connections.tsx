import { type Guide, GuideLink } from "../shared";

export const aiConnections = {
  slug: "ai-connections",
  title: "Connect your AI provider",
  description: "Use your own API key, choose a default model, and manage individual AI requests.",
  group: "How-to guides",
  sections: [
    {
      id: "connect",
      title: "Add a connection",
      body: (
        <>
          <p>
            River supports OpenAI, Anthropic, Google Gemini, and OpenRouter. AI assistance requires
            your own provider API key, including for administrator accounts. You can build a résumé
            manually without connecting AI.
          </p>
          <ol>
            <li>
              Open <strong>Settings → AI connections</strong>.
            </li>
            <li>
              Select <strong>Connect</strong> beside your provider.
            </li>
            <li>Enter an API key from that provider’s developer dashboard.</li>
            <li>
              Select <strong>Test and save</strong>.
            </li>
            <li>
              Under <strong>Your default AI</strong>, choose the connection, search its available
              models, and select a model.
            </li>
            <li>
              Select <strong>Save default</strong>.
            </li>
          </ol>
          <p>
            River encrypts your key on the server and shows only its last four characters. Provider
            usage is billed to your provider account. River has no daily quota for requests using
            your own AI connection. Provider rate limits and River’s limits on simultaneous work,
            request size, time, and retries still apply.
          </p>
        </>
      ),
    },
    {
      id: "choose",
      title: "Choose AI for one action",
      body: (
        <>
          <p>
            Before starting a suggestion, check <strong>AI for this action</strong>. Select{" "}
            <strong>Change</strong> to choose another connected provider and model. This choice does
            not change your saved default.
          </p>
          <p>
            Model lists come from each provider. River filters known incompatible models where
            provider information allows it. A listed model may still lack access or support for a
            particular request. If a request fails, your saved résumé remains unchanged. Retry
            within the task’s limit or start a new task with another model.
          </p>
          <p>
            River does not silently switch to another model or connection. See{" "}
            <GuideLink slug="ai">Review AI suggestions</GuideLink> for reviewing results.
          </p>
        </>
      ),
    },
    {
      id: "manage",
      title: "Replace or remove a key",
      body: (
        <>
          <p>
            Select <strong>Manage</strong> beside a connection. Enter a replacement key and select{" "}
            <strong>Test and save</strong>, or select <strong>Remove connection</strong>. To check a
            saved key without replacing it, select <strong>Test saved connection</strong>.
          </p>
          <p>
            Queued work using a removed or replaced key cannot start another provider call. A call
            already sent may finish. Saved suggestions remain available for review. Choose an active
            connection and start a new task when you want to change its model or key. Removing the
            default connection clears your default AI selection.
          </p>
        </>
      ),
    },
    {
      id: "advanced",
      title: "Optional advanced tools",
      body: (
        <>
          <p>
            In Settings, enable <strong>Advanced tools</strong>, then select{" "}
            <strong>Open advanced tools</strong>. This separate area provides template code editing,
            saved technical inputs, and LaTeX or JSON downloads. You do not need it to build,
            review, or export a PDF.
          </p>
          <p>
            Full original documents remain in Sources. Normal review screens show the editable
            results and wording changes needed for the current task.
          </p>
        </>
      ),
    },
    {
      id: "scoring",
      title: "ATS scoring is separate",
      body: (
        <p>
          ATS scoring uses River’s separate scoring service. It does not use your connected API key.
          See <GuideLink slug="scoring">Score a résumé</GuideLink> for its workflow and
          successful-result allowance.
        </p>
      ),
    },
  ],
} as const satisfies Guide;
