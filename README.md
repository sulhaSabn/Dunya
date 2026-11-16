# DUNYA — همه فایل‌ها در یک سطح

تمام فایل‌های پروژه کنار هم و در ریشه هستند؛ پوشه public وجود ندارد.

## فایل‌ها
- server.js: سرور Node.js و API
- index.html: رابط کاربری سایت
- package.json: وابستگی‌ها
- render.yaml: تنظیمات Render
- .env.example: نمونه متغیرها
- README.md: راهنما

## تنظیم Supabase
1. در Supabase یک Storage bucket با نام `dunya-media` بساز.
2. برای نمایش مستقیم عکس و ویدئو، Bucket را Public قرار بده.
3. Project URL را در `SUPABASE_URL` و کلید Secret سرور را در `SUPABASE_SERVICE_ROLE_KEY` قرار بده.
4. `SUPABASE_BUCKET=dunya-media` را تنظیم کن.
5. کلید Service Role فقط در Environment سرور Render باشد؛ هرگز در HTML یا مخزن عمومی قرار نده.

## انتشار روی Render
1. ZIP را استخراج کن و همه فایل‌ها را مستقیماً در ریشه مخزن GitHub بگذار.
2. در Render یک Web Service یا Blueprint بساز و مخزن را متصل کن.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. در Environment مقادیر `MONGODB_URI`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` و `SUPABASE_BUCKET` را وارد کن.
6. برای OTP ایمیل، SMTP و برای OTP پیامک، Twilio را تنظیم کن.
7. پس از Deploy، `/api/health` را باز کن.

## امکانات فعلی
ثبت‌نام/ورود، OTP ایمیل یا پیامک پس از تنظیم سرویس، پست متنی، عکس و ویدئو، لایک و کامنت. اطلاعات کاربران و پست‌ها در MongoDB و رسانه‌ها در Supabase Storage ذخیره می‌شوند.

## مواردی که هنوز ساخته نشده‌اند
فروشگاه، پرداخت، کیف پول، تبلیغات پولی، چت زنده، استوری، دنبال‌کردن و پنل مدیریت. این نسخه MVP است و پیش از عرضه عمومی به تست امنیتی، حریم خصوصی، پشتیبان‌گیری و مدیریت محتوا نیاز دارد.
