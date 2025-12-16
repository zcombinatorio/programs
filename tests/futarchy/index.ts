// Futarchy Test Suite Entry Point

// Happy path tests
import "./happy-path/moderator";
import "./happy-path/lifecycle";

// Error tests
import "./errors/state-errors";
import "./errors/auth-errors";
import "./errors/validation-errors";

// Multi-user tests
import "./multi-user/concurrent-proposals";
