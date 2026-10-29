
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");

// User signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email, and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters",
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      message: "Signup successful. Check your email if confirmation is required.",
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// User login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    res.json({
      message: "Login successful",
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
