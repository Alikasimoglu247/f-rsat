import { z } from "zod";
import type { ListingView } from "./listings";
// The model selects existing fact IDs. It cannot invent prose, numbers or legal claims.
export async function optionalAiExplanation(listing: ListingView) {
  const assessment = listing.assessment;
  if (process.env.AI_ENABLED !== "true")
    return {
      enabled: false,
      text: assessment?.explanation ?? "Önce analiz çalıştırın.",
      mode: "DETERMINISTIC",
    };
  if (!process.env.AI_API_KEY || !process.env.AI_MODEL || !assessment)
    throw new Error("AI yapılandırması veya analiz eksik.");
  const facts = [
    assessment.explanation,
    ...assessment.riskFlags.map((flag) => flag.label),
  ];
  const base = new URL(process.env.AI_BASE_URL ?? "https://api.openai.com/v1");
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("AI hedefi HTTPS olmalı.");
  const response = await fetch(
    `${base.toString().replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Select up to 4 distinct most useful provided Turkish evidence fact IDs. Return only JSON {"factIds":[0,1]}. Never create facts. Always include ID 0.',
          },
          {
            role: "user",
            content: JSON.stringify(facts.map((text, id) => ({ id, text }))),
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI yanıtı boş.");
  const result = z
    .object({
      factIds: z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(facts.length - 1),
        )
        .min(1)
        .max(4),
    })
    .parse(JSON.parse(content));
  return {
    enabled: true,
    mode: "AI_EVIDENCE_SELECTION",
    text: [...new Set([0, ...result.factIds])].map((id) => facts[id]).join(" "),
  };
}
