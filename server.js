require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer");
const twilio = require("twilio");

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL] : true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  passwordHash: { type: String, required: true },
  verified: { type: Boolean, default: false },
  bio: { type: String, maxlength: 240, default: "" },
  avatar: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, maxlength: 3000, default: "" },
  media: [{ url: String, type: String, publicId: String }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, text: { type: String, maxlength: 1000 }, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });
const otpSchema = new mongoose.Schema({
  target: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, default: "verify" },
  expiresAt: { type: Date, required: true, expires: 0 },
  attempts: { type: Number, default: 0 }
});
const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);
const OTP = mongoose.model("OTP", otpSchema);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 4 } });
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.sub);
    if (!req.user) return res.status(401).json({ error: "حساب کاربری پیدا نشد." });
    next();
  } catch { return res.status(401).json({ error: "لطفاً دوباره وارد شوید." }); }
}
function cleanUser(user) {
  return { id: user._id, name: user.name, username: user.username, email: user.email, phone: user.phone, bio: user.bio, avatar: user.avatar, verified: user.verified };
}
async function sendOtp(target, code, channel) {
  if (process.env.DEV_RETURN_OTP === "true") return;
  if (channel === "email") {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("تنظیمات ایمیل هنوز کامل نشده است.");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({ from: process.env.MAIL_FROM, to: target, subject: "کد تأیید DUNYA", text: `کد تأیید شما: ${code} (اعتبار: ۱۰ دقیقه)` });
  } else {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) throw new Error("سرویس پیامک هنوز تنظیم نشده است.");
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: `کد تأیید DUNYA: ${code}`, from: process.env.TWILIO_PHONE_NUMBER, to: target });
  }
}
function mediaUpload(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: "dunya", resource_type: resourceType }, (err, result) => err ? reject(err) : resolve(result));
    stream.end(buffer);
  });
}

app.get("/api/health", (req, res) => res.json({ ok: true, app: "DUNYA", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { name, username, email, phone, password } = req.body;
  if (!name || !username || !password || (!email && !phone)) return res.status(400).json({ error: "نام، نام کاربری، رمز عبور و ایمیل یا شماره تلفن لازم است." });
  if (password.length < 8) return res.status(400).json({ error: "رمز عبور باید حداقل ۸ حرف باشد." });
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا _ باشد." });
  const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
  const normalizedPhone = phone ? String(phone).trim() : undefined;
  const exists = await User.findOne({ $or: [{ username: username.toLowerCase() }, ...(normalizedEmail ? [{ email: normalizedEmail }] : []), ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])] });
  if (exists) return res.status(409).json({ error: "این نام کاربری، ایمیل یا شماره قبلاً استفاده شده است." });
  const user = await User.create({ name, username, email: normalizedEmail, phone: normalizedPhone, passwordHash: await bcrypt.hash(password, 12) });
  const target = normalizedEmail || normalizedPhone;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await OTP.create({ target, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  try { await sendOtp(target, code, normalizedEmail ? "email" : "phone"); }
  catch (e) { await User.findByIdAndDelete(user._id); await OTP.deleteMany({ target }); throw e; }
  res.status(201).json({ message: "حساب ساخته شد. کد تأیید ارسال شد.", ...(process.env.DEV_RETURN_OTP === "true" ? { devOtp: code } : {}), user: cleanUser(user) });
}));

app.post("/api/auth/verify", asyncHandler(async (req, res) => {
  const { target, code } = req.body;
  const record = await OTP.findOne({ target }).sort({ expiresAt: -1 });
  if (!record || record.expiresAt < new Date() || record.attempts >= 5) return res.status(400).json({ error: "کد نامعتبر یا منقضی شده است." });
  record.attempts += 1; await record.save();
  if (!await bcrypt.compare(String(code || ""), record.codeHash)) return res.status(400).json({ error: "کد تأیید اشتباه است." });
  const user = await User.findOne({ $or: [{ email: target }, { phone: target }] });
  if (!user) return res.status(404).json({ error: "کاربر پیدا نشد." });
  user.verified = true; await user.save(); await OTP.deleteMany({ target });
  res.json({ token: tokenFor(user), user: cleanUser(user) });
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { login, password } = req.body;
  const user = await User.findOne({ $or: [{ email: String(login || "").toLowerCase() }, { phone: login }, { username: String(login || "").toLowerCase() }] });
  if (!user || !await bcrypt.compare(password || "", user.passwordHash)) return res.status(401).json({ error: "اطلاعات ورود نادرست است." });
  if (!user.verified) return res.status(403).json({ error: "ابتدا ایمیل یا شماره تلفن خود را تأیید کنید." });
  res.json({ token: tokenFor(user), user: cleanUser(user) });
}));

app.get("/api/me", auth, asyncHandler(async (req, res) => res.json({ user: cleanUser(req.user) })));
app.patch("/api/me", auth, asyncHandler(async (req, res) => {
  const { name, bio, avatar } = req.body;
  if (name !== undefined) req.user.name = String(name).slice(0, 60);
  if (bio !== undefined) req.user.bio = String(bio).slice(0, 240);
  if (avatar !== undefined) req.user.avatar = String(avatar).slice(0, 500);
  await req.user.save(); res.json({ user: cleanUser(req.user) });
}));
app.get("/api/users/:username", asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() });
  if (!user) return res.status(404).json({ error: "کاربر پیدا نشد." });
  res.json({ user: cleanUser(user) });
}));

app.post("/api/upload", auth, upload.array("files", 4), asyncHandler(async (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ error: "فضای آپلود Cloudinary تنظیم نشده است." });
  if (!req.files?.length) return res.status(400).json({ error: "فایلی انتخاب نشده است." });
  const results = [];
  for (const file of req.files) {
    if (!/^image\/|^video\//.test(file.mimetype)) return res.status(400).json({ error: "فقط عکس و ویدئو مجاز است." });
    const type = file.mimetype.startsWith("video/") ? "video" : "image";
    const result = await mediaUpload(file.buffer, type);
    results.push({ url: result.secure_url, type, publicId: result.public_id });
  }
  res.json({ media: results });
}));

app.post("/api/posts", auth, asyncHandler(async (req, res) => {
  const { text = "", media = [] } = req.body;
  if (!String(text).trim() && !media.length) return res.status(400).json({ error: "متن یا رسانه لازم است." });
  if (media.length > 4) return res.status(400).json({ error: "حداکثر ۴ فایل برای هر پست مجاز است." });
  const post = await Post.create({ author: req.user._id, text: String(text).slice(0, 3000), media });
  await post.populate("author", "name username avatar");
  res.status(201).json({ post });
}));
app.get("/api/posts", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const posts = await Post.find().sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20)
    .populate("author", "name username avatar")
    .populate("comments.author", "name username avatar");
  res.json({ posts });
}));
app.post("/api/posts/:id/like", auth, asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "پست پیدا نشد." });
  const index = post.likes.findIndex(id => id.equals(req.user._id));
  if (index >= 0) post.likes.splice(index, 1); else post.likes.push(req.user._id);
  await post.save(); res.json({ likes: post.likes.length, liked: index < 0 });
}));
app.post("/api/posts/:id/comments", auth, asyncHandler(async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 1000) return res.status(400).json({ error: "متن نظر لازم است و حداکثر ۱۰۰۰ حرف باشد." });
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "پست پیدا نشد." });
  post.comments.push({ author: req.user._id, text }); await post.save();
  await post.populate("comments.author", "name username avatar");
  res.json({ comments: post.comments });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "خطای داخلی سرور." });
});

const port = process.env.PORT || 10000;
mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log("MongoDB connected");
  app.listen(port, () => console.log(`DUNYA running on ${port}`));
}).catch(err => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
