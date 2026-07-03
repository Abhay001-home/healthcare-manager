const Anthropic = require('@anthropic-ai/sdk');
const Appointment = require('../models/Appointment');
const logger = require('../config/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/* ── Pre-visit summary ──────────────────────────────────────────────────── */
async function generatePreVisitSummary(appointmentId, symptomText, durationDays) {
  const prompt = `You are a clinical triage assistant. A patient has submitted the following symptoms before their appointment.

Symptoms: ${symptomText}
Duration: ${durationDays} day(s)

Analyse the information and return a JSON object with EXACTLY these fields:
{
  "urgency_level": "Low" | "Medium" | "High",
  "chief_complaint": "<one concise sentence summarising the main complaint>",
  "suggested_questions": ["<question 1>", "<question 2>", "<question 3>"]
}

Rules:
- urgency_level = High if symptoms suggest possible cardiac, respiratory, neurological emergency or severe bleeding.
- urgency_level = Medium if symptoms are persistent (>=5 days), worsening, or involve fever/vomiting/dizziness.
- urgency_level = Low for mild, short-duration, non-emergency symptoms.
- suggested_questions must be clinically relevant follow-up questions a doctor would ask this specific patient.
- Return ONLY the JSON object. No markdown, no preamble.`;

  let rawResponse = null;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    rawResponse = message.content[0].text;
    const parsed = JSON.parse(rawResponse.replace(/```json|```/g, '').trim());

    await Appointment.findByIdAndUpdate(appointmentId, {
      pre_visit_summary: {
        urgency_level:       parsed.urgency_level,
        chief_complaint:     parsed.chief_complaint,
        suggested_questions: parsed.suggested_questions,
        raw_prompt:          prompt,
        raw_response:        rawResponse,
        model_used:          MODEL,
        error:               null,
        generated_at:        new Date(),
      },
    });

    logger.info('Pre-visit summary generated', { appointmentId, urgency: parsed.urgency_level });
    return parsed;
  } catch (err) {
    logger.error('Pre-visit LLM failure', { appointmentId, err: err.message });

    const fallback = {
      urgency_level: null,
      chief_complaint: null,
      suggested_questions: [],
      raw_prompt: prompt,
      raw_response: rawResponse || err.message,
      model_used: MODEL,
      error: 'AI summary unavailable. Raw symptoms are shown below.',
      generated_at: new Date(),
    };
    await Appointment.findByIdAndUpdate(appointmentId, { pre_visit_summary: fallback }).catch(() => {});
    return { ...fallback };
  }
}

/* ── Post-visit summary ─────────────────────────────────────────────────── */
async function generatePostVisitSummary(appointmentId, clinicalNotes, prescriptions) {
  const rxText = prescriptions.length
    ? prescriptions.map((p) => `- ${p.drug_name} ${p.dosage || ''}, ${p.frequency}, for ${p.duration_days} day(s)`).join('\n')
    : 'No medications prescribed.';

  const prompt = `You are a patient communication specialist at a clinic. A doctor has submitted clinical notes and a prescription after a patient visit.

Clinical Notes:
${clinicalNotes}

Prescription:
${rxText}

Convert this into a patient-friendly summary. Return a JSON object with EXACTLY these fields:
{
  "patient_summary": "<2-3 friendly paragraphs explaining what happened, what was found, and what the patient should do>",
  "medication_schedule": [
    { "drug": "<name>", "instructions": "<plain-language dosing instruction>" }
  ],
  "follow_up_advice": "<one clear sentence about whether and when to return or seek further care>"
}

Rules:
- Use simple, non-clinical language a layperson can understand.
- medication_schedule should have one entry per drug in the prescription.
- Return ONLY the JSON object. No markdown, no preamble.`;

  let rawResponse = null;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    rawResponse = message.content[0].text;
    const parsed = JSON.parse(rawResponse.replace(/```json|```/g, '').trim());

    await Appointment.findByIdAndUpdate(appointmentId, {
      post_visit_summary: {
        patient_summary:     parsed.patient_summary,
        medication_schedule: parsed.medication_schedule,
        follow_up_advice:    parsed.follow_up_advice,
        raw_prompt:          prompt,
        raw_response:        rawResponse,
        model_used:          MODEL,
        generated_at:        new Date(),
      },
    });

    logger.info('Post-visit summary generated', { appointmentId });
    return parsed;
  } catch (err) {
    logger.error('Post-visit LLM failure', { appointmentId, err: err.message });

    const fallback = {
      patient_summary: 'Your visit summary is being prepared. Please check back shortly.',
      medication_schedule: prescriptions.map((p) => ({
        drug: p.drug_name,
        instructions: `${p.dosage || ''} — ${p.frequency} for ${p.duration_days} day(s)`.trim(),
      })),
      follow_up_advice: "Please follow your doctor's instructions. Contact the clinic with any concerns.",
      raw_prompt:    prompt,
      raw_response:  rawResponse || err.message,
      model_used:    MODEL,
      error:         'AI summary generation failed. Clinical notes and prescription are saved.',
      generated_at:  new Date(),
    };
    await Appointment.findByIdAndUpdate(appointmentId, { post_visit_summary: fallback }).catch(() => {});
    return { ...fallback };
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
