// functions/api/sync.js

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. ตรวจสอบความปลอดภัยด้วย x-api-key
    // ป้องกันไม่ให้คนแปลกหน้าแอบยิงข้อมูลเข้ามาในฐานข้อมูลของเรา
    const clientApiKey = request.headers.get("x-api-key");
    if (!clientApiKey || clientApiKey !== env.SYNC_SECRET_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid API Key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. ดึงข้อมูล JSON ที่ Power Automate ส่งมา
    const body = await request.json();
    const { id, name, type, full_path, parent_path, web_url, file_size } = body;

    // ตรวจสอบว่ามีข้อมูลจำเป็นครบถ้วนหรือไม่
    if (!id || !name || !web_url) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields (id, name, web_url)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. เขียนข้อมูลลง Cloudflare D1 (คำสั่ง UPSERT: ถ้ามี id เดิมอยู่แล้วให้อัปเดต ถ้ายังไม่มีให้เพิ่มใหม่)
    const sql = `
      INSERT INTO files (id, name, type, full_path, parent_path, web_url, file_size, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        full_path = excluded.full_path,
        parent_path = excluded.parent_path,
        web_url = excluded.web_url,
        file_size = excluded.file_size,
        updated_at = CURRENT_TIMESTAMP;
    `;

    // env.DB มาจากการที่เรา Bind D1 ไว้ใน Dashboard
    await env.DB.prepare(sql)
      .bind(
        id,
        name,
        type || "file",
        full_path || "/",
        parent_path || "/",
        web_url,
        file_size || 0
      )
      .run();

    // 4. ส่งสถานะตอบกลับว่าสำเร็จ
    return new Response(
      JSON.stringify({ success: true, message: "File synced to D1 successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    // ดักจับ Error ในกรณีคำสั่ง SQL ผิดพลาด หรือ JSON ผิดรูปแบบ
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
