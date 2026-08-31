# Example runs

Two real outputs from this project, included so the summarization
quality can be judged without needing to run the app.

- **01-minimal-recording** — a near-empty test clip. 
Shows the model correctly returning empty decisions/action-items instead of inventing content when the transcript doesn't support any.
- **02-product-design-kickoff** — an ~11-minute real business meeting
  (a product design team's kickoff discussion, from the AMI Meeting
  Corpus, CC BY 4.0). Shows extraction of real decisions (pricing,
  targets, constraints) and action items with correctly identified
  owners.

Each folder has:
- `transcript.txt` — the exact ASR output fed to the summarizer
- `output.json` — the exact JSON the LLM returned (summary, decisions, action_items)