const GAS_URL = String(process.env.GAS_URL || "").trim();

module.exports = async function handler(req, res) {
  // =========================================================
  // 1. CEK ENVIRONMENT VARIABLE
  // =========================================================
  if (!GAS_URL) {
    return res.status(500).json({
      success: false,
      message: "Environment variable GAS_URL belum diatur di Vercel."
    });
  }

  // =========================================================
  // 2. CEK FORMAT GAS_URL
  // =========================================================
  let gasUrl;

  try {
    gasUrl = new URL(GAS_URL);

    if (
      gasUrl.protocol !== "https:" ||
      !gasUrl.hostname.includes("script.google.com")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "GAS_URL tidak valid. Gunakan URL Web App Google Apps Script yang berakhiran /exec."
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Format GAS_URL tidak valid.",
      error: error.message
    });
  }

  try {
    // =======================================================
    // 3. REQUEST GET
    //    Contoh:
    //    /api/booking?action=health
    //    /api/booking?action=slots&barberId=b1&date=2026-09-09
    //    /api/booking?action=lookup&phone=08xxxxxxxxxx
    // =======================================================
    if (req.method === "GET") {
      const incoming = new URL(
        req.url,
        `https://${req.headers.host || "localhost"}`
      );

      const target = new URL(gasUrl.toString());

      // Salin query parameter dari Vercel ke Google Apps Script
      for (const [key, value] of incoming.searchParams.entries()) {
        target.searchParams.set(key, value);
      }

      console.log("GET Google Apps Script:", target.pathname);

      const response = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "User-Agent": "Kenari-Barbershop-Vercel"
        }
      });

      const text = await response.text();

      console.log("GAS GET status:", response.status);
      console.log("GAS GET response:", text.substring(0, 1000));

      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        return res.status(502).json({
          success: false,
          message:
            "Google Apps Script tidak mengirim JSON. Kemungkinan deployment Apps Script belum disetel sebagai Web App untuk akses publik.",
          gasStatus: response.status,
          gasResponse: text.substring(0, 1000)
        });
      }

      return res.status(response.ok ? 200 : 502).json(data);
    }

    // =======================================================
    // 4. REQUEST POST
    //    Menyimpan reservasi ke Google Sheet
    // =======================================================
    if (req.method === "POST") {
      let payload = req.body;

      // Jika body dikirim sebagai string
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Data JSON dari website tidak valid.",
            error: error.message
          });
        }
      }

      // Pastikan payload merupakan object
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({
          success: false,
          message: "Data reservasi tidak ditemukan."
        });
      }

      console.log("POST booking:", {
        code: payload.code,
        name: payload.name,
        phone: payload.phone,
        date: payload.date,
        time: payload.time,
        barberId: payload.barberId
      });

      // Google Apps Script menerima parameter "data"
      const form = new URLSearchParams();

      form.set("data", JSON.stringify(payload));

      const response = await fetch(gasUrl.toString(), {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "Kenari-Barbershop-Vercel"
        },
        body: form.toString()
      });

      const text = await response.text();

      console.log("GAS POST status:", response.status);
      console.log("GAS POST response:", text.substring(0, 1500));

      let data;

      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        return res.status(502).json({
          success: false,
          message:
            "Google Apps Script tidak mengirim respons JSON setelah reservasi dikirim.",
          gasStatus: response.status,
          gasResponse: text.substring(0, 1500)
        });
      }

      // Jika Apps Script mengatakan reservasi gagal/slot sudah terisi
      if (data.success === false) {
        return res.status(409).json(data);
      }

      return res.status(response.ok ? 200 : 502).json(data);
    }

    // =======================================================
    // 5. METHOD LAIN
    // =======================================================
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      success: false,
      message: "Method tidak didukung. Gunakan GET atau POST."
    });

  } catch (error) {
    console.error("ERROR API BOOKING:", error);

    return res.status(500).json({
      success: false,
      message: "API Vercel gagal menghubungi Google Apps Script.",
      error: error.message,
      errorName: error.name
    });
  }
};