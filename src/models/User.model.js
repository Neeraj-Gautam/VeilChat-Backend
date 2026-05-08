import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name must be at most 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never return password by default
    },
    avatar: {
      type: String,
      default: "",
    },
    refreshToken: {
      type: String,
      select: false, // Never return refresh token by default
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// ── Hash password before saving ───────────────────────────
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  // Avoid double-hashing if already a bcrypt hash
  if (this.password.startsWith("$2b$") || this.password.startsWith("$2a$")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Instance method: compare passwords ────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  // If stored password is not a bcrypt hash, compare directly (migration fallback)
  if (!this.password.startsWith("$2b$") && !this.password.startsWith("$2a$")) {
    return this.password === candidatePassword;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
