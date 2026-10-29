
const express = require("express");
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { isUuid, cleanText, sendDbError } = require("../utils");

const router = express.Router();

const categories = ["books", "supplies", "tutoring", "other"];
const kinds = ["offer", "need"];

// Browse active listings
router.get("/", async (req, res) => {
  let query = supabase
    .from("listings")
    .select("id,title,description,category,kind,location,status,created_at,owner_id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  const { q, category, kind } = req.query;

  if (category) {
    if (!categories.includes(category)) {
      return res.status(400).json({ error: "Invalid category." });
    }
    query = query.eq("category", category);
  }

  if (kind) {
    if (!kinds.includes(kind)) {
      return res.status(400).json({ error: "Kind must be offer or need." });
    }
    query = query.eq("kind", kind);
  }

  if (typeof q === "string" && q.trim()) {
    const search = q.trim().slice(0, 100).replace(/[%_,()]/g, " ");
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return sendDbError(res, error, "Could not load listings.");

  res.json({ listings: data });
});

// View your own listings
router.get("/mine", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("owner_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return sendDbError(res, error, "Could not load your listings.");
  res.json({ listings: data });
});

// Create a listing
router.post("/", requireAuth, async (req, res) => {
  const title = cleanText(req.body?.title, 120);
  const description = cleanText(req.body?.description, 2000);
  const { category, kind } = req.body || {};
  const location = req.body?.location
    ? cleanText(req.body.location, 160)
    : null;

  if (
    !title ||
    !description ||
    !categories.includes(category) ||
    !kinds.includes(kind) ||
    (req.body?.location && !location)
  ) {
    return res.status(400).json({
      error: "Provide a title, description, valid category and kind. Location is optional."
    });
  }

  const { data, error } = await supabase
    .from("listings")
    .insert({
      owner_id: req.user.id,
      title,
      description,
      category,
      kind,
      location
    })
    .select("*")
    .single();

  if (error) return sendDbError(res, error, "Could not create listing.");
  res.status(201).json({ listing: data });
});

// View one listing
router.get("/:id", async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: "Invalid listing ID." });
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id,title,description,category,kind,location,status,created_at,owner_id")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) return sendDbError(res, error, "Could not load listing.");
  if (!data || data.status === "removed") {
    return res.status(404).json({ error: "Listing not found." });
  }

  res.json({ listing: data });
});

// Update a listing you own
router.patch("/:id", requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: "Invalid listing ID." });
  }

  const input = req.body || {};
  const allowed = ["title", "description", "category", "kind", "location", "status"];
  const keys = Object.keys(input);

  if (!keys.length || keys.some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: "Provide valid listing fields." });
  }

  const updates = {};

  if ("title" in input) {
    updates.title = cleanText(input.title, 120);
    if (!updates.title) return res.status(400).json({ error: "Invalid title." });
  }

  if ("description" in input) {
    updates.description = cleanText(input.description, 2000);
    if (!updates.description) return res.status(400).json({ error: "Invalid description." });
  }

  if ("category" in input) {
    if (!categories.includes(input.category)) {
      return res.status(400).json({ error: "Invalid category." });
    }
    updates.category = input.category;
  }

  if ("kind" in input) {
    if (!kinds.includes(input.kind)) {
      return res.status(400).json({ error: "Invalid kind." });
    }
    updates.kind = input.kind;
  }

  if ("location" in input) {
    updates.location = input.location
      ? cleanText(input.location, 160)
      : null;

    if (input.location && !updates.location) {
      return res.status(400).json({ error: "Invalid location." });
    }
  }

  if ("status" in input) {
    if (!["active", "fulfilled", "removed"].includes(input.status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    updates.status = input.status;
  }

  const { data, error } = await supabase
    .from("listings")
    .update(updates)
    .eq("id", req.params.id)
    .eq("owner_id", req.user.id)
    .select("*")
    .maybeSingle();

  if (error) return sendDbError(res, error, "Could not update listing.");
  if (!data) {
    return res.status(404).json({ error: "Listing not found or not owned by you." });
  }

  res.json({ listing: data });
});

// Soft-remove a listing
router.delete("/:id", requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: "Invalid listing ID." });
  }

  const { data, error } = await supabase
    .from("listings")
    .update({ status: "removed" })
    .eq("id", req.params.id)
    .eq("owner_id", req.user.id)
    .select("id")
    .maybeSingle();

  if (error) return sendDbError(res, error, "Could not remove listing.");
  if (!data) {
    return res.status(404).json({ error: "Listing not found or not owned by you." });
  }

  res.json({ message: "Listing removed." });
});

module.exports = router;
