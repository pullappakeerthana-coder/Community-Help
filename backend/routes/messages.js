
const express = require("express");
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { isUuid, cleanText, sendDbError } = require("../utils");

const router = express.Router();

async function getParticipants(requestId) {
  const { data: request, error } = await supabase
    .from("help_requests")
    .select("id,listing_id,requester_id")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !request) return { error };

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("owner_id")
    .eq("id", request.listing_id)
    .maybeSingle();

  if (listingError || !listing) {
    return { error: listingError || new Error("Listing not found") };
  }

  return { request, ownerId: listing.owner_id };
}

// Read messages
router.get("/:requestId", requireAuth, async (req, res) => {
  const requestId = req.params.requestId;

  if (!isUuid(requestId)) {
    return res.status(400).json({ error: "Invalid request ID." });
  }

  const participants = await getParticipants(requestId);

  if (participants.error) {
    return sendDbError(res, participants.error, "Could not load conversation.");
  }

  if (
    req.user.id !== participants.ownerId &&
    req.user.id !== participants.request.requester_id
  ) {
    return res.status(403).json({ error: "You are not part of this conversation." });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id,request_id,sender_id,body,created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return sendDbError(res, error, "Could not load messages.");

  res.json({ messages: data });
});

// Send a message
router.post("/:requestId", requireAuth, async (req, res) => {
  const requestId = req.params.requestId;
  const body = cleanText(req.body?.body, 2000);

  if (!isUuid(requestId)) {
    return res.status(400).json({ error: "Invalid request ID." });
  }

  if (!body) {
    return res.status(400).json({ error: "Message body is required (max 2000 characters)." });
  }

  const participants = await getParticipants(requestId);

  if (participants.error) {
    return sendDbError(res, participants.error, "Could not check conversation.");
  }

  if (
    req.user.id !== participants.ownerId &&
    req.user.id !== participants.request.requester_id
  ) {
    return res.status(403).json({ error: "You cannot message these users." });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      request_id: requestId,
      sender_id: req.user.id,
      body
    })
    .select("id,request_id,sender_id,body,created_at")
    .single();

  if (error) return sendDbError(res, error, "Could not send message.");

  res.status(201).json({ message: data });
});

module.exports = router;
