
const express = require("express");
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { isUuid, cleanText, sendDbError } = require("../utils");

const router = express.Router();

// View requests you made and requests for your listings
router.get("/mine", requireAuth, async (req, res) => {
  const { data: own, error: ownError } = await supabase
    .from("help_requests")
    .select("id,listing_id,requester_id,message,status,created_at,updated_at")
    .eq("requester_id", req.user.id)
    .order("created_at", { ascending: false });

  if (ownError) return sendDbError(res, ownError, "Could not load your requests.");

  const { data: listings, error: listingError } = await supabase
    .from("listings")
    .select("id")
    .eq("owner_id", req.user.id);

  if (listingError) {
    return sendDbError(res, listingError, "Could not load your listings.");
  }

  const ids = (listings || []).map(item => item.id);
  let received = [];

  if (ids.length) {
    const { data, error } = await supabase
      .from("help_requests")
      .select("id,listing_id,requester_id,message,status,created_at,updated_at")
      .in("listing_id", ids)
      .order("created_at", { ascending: false });

    if (error) return sendDbError(res, error, "Could not load received requests.");
    received = data || [];
  }

  const unique = new Map([...own, ...received].map(item => [item.id, item]));
  res.json({ requests: [...unique.values()] });
});

// Request help from a listing
router.post("/", requireAuth, async (req, res) => {
  const listingId = req.body?.listingId;
  const message = cleanText(req.body?.message, 1000);

  if (!isUuid(listingId) || !message) {
    return res.status(400).json({
      error: "A valid listingId and message are required."
    });
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id,owner_id,status,kind")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return sendDbError(res, listingError, "Could not check listing.");
  }

  if (!listing || listing.status !== "active") {
    return res.status(404).json({ error: "Active listing not found." });
  }

  if (listing.owner_id === req.user.id) {
    return res.status(400).json({ error: "You cannot request your own listing." });
  }

  const { data, error } = await supabase
    .from("help_requests")
    .insert({
      listing_id: listingId,
      requester_id: req.user.id,
      message
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "You already requested this listing." });
    }
    return sendDbError(res, error, "Could not create request.");
  }

  res.status(201).json({ request: data });
});

// Accept, decline, cancel, or fulfil a request
router.patch("/:id", requireAuth, async (req, res) => {
  const requestId = req.params.id;
  const status = req.body?.status;

  if (!isUuid(requestId)) {
    return res.status(400).json({ error: "Invalid request ID." });
  }

  if (!["accepted", "declined", "cancelled", "fulfilled"].includes(status)) {
    return res.status(400).json({ error: "Invalid request status." });
  }

  const { data: request, error: requestError } = await supabase
    .from("help_requests")
    .select("id,listing_id,requester_id,status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) return sendDbError(res, requestError, "Could not load request.");
  if (!request) return res.status(404).json({ error: "Request not found." });

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("owner_id")
    .eq("id", request.listing_id)
    .maybeSingle();

  if (listingError) return sendDbError(res, listingError, "Could not check listing owner.");

  const isOwner = listing?.owner_id === req.user.id;
  const isRequester = request.requester_id === req.user.id;

  if (["accepted", "declined", "fulfilled"].includes(status) && !isOwner) {
    return res.status(403).json({ error: "Only the listing owner can set that status." });
  }

  if (status === "cancelled" && !isOwner && !isRequester) {
    return res.status(403).json({ error: "You cannot cancel this request." });
  }

  if (["declined", "cancelled", "fulfilled"].includes(request.status)) {
    return res.status(409).json({ error: "This request is already closed." });
  }

  if (status === "fulfilled" && request.status !== "accepted") {
    return res.status(409).json({ error: "Accept the request before marking it fulfilled." });
  }

  const { data, error } = await supabase
    .from("help_requests")
    .update({ status })
    .eq("id", request.id)
    .select("*")
    .single();

  if (error) return sendDbError(res, error, "Could not update request.");

  if (status === "fulfilled") {
    const { error: updateError } = await supabase
      .from("listings")
      .update({ status: "fulfilled" })
      .eq("id", request.listing_id)
      .eq("owner_id", req.user.id);

    if (updateError) {
      return sendDbError(res, updateError, "Request updated, but listing update failed.");
    }
  }

  res.json({ request: data });
});

module.exports = router;

