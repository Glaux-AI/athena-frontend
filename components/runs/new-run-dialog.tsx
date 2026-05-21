"use client";

/**
 * NewRunDialog — production-grade form for starting an agent run.
 *
 * Validates with Zod + react-hook-form; submits to POST /v1/runs; surfaces
 * field-level errors from the server envelope (`{ error: { code, message,
 * field } }`).
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Sparkles } from "lucide-react";

import * as Dialog from "@radix-ui/react-dialog";
import { api, ApiError, type Run } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";

const schema = z.object({
  goal: z
    .string()
    .trim()
    .min(8, "Describe the goal in at least a sentence.")
    .max(500, "Keep the goal under 500 characters."),
});

type FormValues = z.infer<typeof schema>;

export function NewRunDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (run: Run) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { goal: "" },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const run = await api.runs.create(values.goal);
      reset();
      onCreated(run);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.field === "goal") {
          setError("goal", { type: "server", message: e.message });
        } else {
          setServerError(e.message);
        }
      } else {
        setServerError("Unknown error starting the run.");
      }
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl focus:outline-none"
          aria-describedby="new-run-desc"
        >
          <Stack gap="4">
            <Stack gap="1">
              <Dialog.Title className="text-lg font-semibold">Start a run</Dialog.Title>
              <Dialog.Description id="new-run-desc" className="text-sm text-[var(--text-muted)]">
                Describe what you want Athena to do. The orchestrator decides whether
                this is a chat reply or a PRD generation; you can override on the
                run page.
              </Dialog.Description>
            </Stack>

            <form onSubmit={submit} noValidate>
              <Stack gap="3">
                <label className="block">
                  <span className="mb-1 inline-block text-sm font-medium">Goal</span>
                  <textarea
                    {...register("goal")}
                    rows={4}
                    autoFocus
                    placeholder="e.g. Add an unsubscribe link to the payment-failure email."
                    aria-invalid={!!errors.goal}
                    aria-errormessage={errors.goal ? "goal-err" : undefined}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  {errors.goal && (
                    <p id="goal-err" className="mt-1 text-xs text-[var(--danger)]">
                      {errors.goal.message}
                    </p>
                  )}
                </label>

                {serverError && (
                  <p role="alert" className="text-sm text-[var(--danger)]">
                    {serverError}
                  </p>
                )}

                <Cluster justify="between" align="center">
                  <span className="text-xs text-[var(--text-subtle)]">
                    <Sparkles className="mr-1 inline size-3" /> Athena routes between chat and PRD agents automatically.
                  </span>
                  <Cluster gap="2">
                    <Dialog.Close asChild>
                      <Button type="button" variant="ghost">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                      Start
                    </Button>
                  </Cluster>
                </Cluster>
              </Stack>
            </form>
          </Stack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
