# Chat model evaluation

Run inside the deployed API container. Use a dedicated evaluation user with a
calendar containing only synthetic events. The runner never confirms a calendar
mutation.

Set the deployed model in `~/bystrek/.env`, then recreate the API:

```sh
LLM_MODEL=smollm2:1.7b
docker compose up -d api
```

Run on the home server. `EVAL_RESET_HISTORY=true` deletes only the evaluation
user's chat history before every independent scenario.

```sh
read -s EVAL_AUTH_TOKEN
export EVAL_AUTH_TOKEN
cd ~/bystrek
docker compose exec -T -e EVAL_AUTH_TOKEN -e EVAL_RESET_HISTORY=true api \
  bun /app/scripts/evaluate-chat.ts > evaluation-smollm2.json
unset EVAL_AUTH_TOKEN
```

Optional settings:

- `EVAL_RUNS` defaults to `3`
- `EVAL_API_URL` defaults to `http://localhost:3000`

Run the same command for each candidate. The runner reads the container's
active `LLM_MODEL`. Compare `toolMatch`, `elapsedMs`, `metrics`, and captured
replies.
