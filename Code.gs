/*******************************************************
 * KENARI BARBERSHOP
 * GOOGLE APPS SCRIPT API
 *
 * Alur:
 * Website
 *   ↓
 * Vercel API /api/booking
 *   ↓
 * Google Apps Script Web App
 *   ↓
 * Google Spreadsheet
 *******************************************************/


/* =====================================================
   KONFIGURASI
   ===================================================== */

const SPREADSHEET_ID = "12-5YwJTdQ4G73QzLM6kVgxAcJ9gZnwzcpU20Xdk1gIs";

const SHEET_NAME = "Reservasi";

const TIMEZONE = "Asia/Makassar";


/* =====================================================
   HEADER SPREADSHEET
   ===================================================== */

const HEADERS = [
  "Kode",
  "Nama",
  "WhatsApp",
  "Layanan",
  "Barber",
  "Barber ID",
  "Tanggal",
  "Jam",
  "Total",
  "Catatan",
  "Status",
  "Dibuat"
];


/* =====================================================
   GET API
   ===================================================== */

function doGet(e) {

  try {

    const action =
      (e &&
       e.parameter &&
       e.parameter.action)
        ? String(e.parameter.action).trim()
        : "health";


    /* -----------------------------------------------
       HEALTH CHECK
       ----------------------------------------------- */

    if (action === "health") {

      // Sekalian memastikan Spreadsheet bisa diakses.
      const sheet = getSheet();

      return jsonOutput({
        success: true,
        message: "API Kenari Barbershop aktif.",
        spreadsheetId: SPREADSHEET_ID,
        sheet: sheet.getName(),
        timestamp: new Date().toISOString()
      });
    }


    /* -----------------------------------------------
       CEK SLOT BOOKING
       ----------------------------------------------- */

    if (action === "slots") {

      const barberId =
        e.parameter.barberId
          ? String(e.parameter.barberId).trim()
          : "";

      const date =
        normalizeDate(
          e.parameter.date || ""
        );


      if (!barberId) {

        return jsonOutput({
          success: false,
          message: "barberId wajib diisi."
        });
      }


      if (!date) {

        return jsonOutput({
          success: false,
          message: "date wajib diisi."
        });
      }


      if (!isValidDateFormat(date)) {

        return jsonOutput({
          success: false,
          message: "Format tanggal harus YYYY-MM-DD."
        });
      }


      return jsonOutput({

        success: true,

        barberId: barberId,

        date: date,

        slots: getBookedSlots(
          barberId,
          date
        )

      });
    }


    /* -----------------------------------------------
       CARI BOOKING BERDASARKAN NOMOR WHATSAPP
       ----------------------------------------------- */

    if (action === "lookup") {

      const phone =
        normalizePhone(
          e.parameter.phone || ""
        );


      if (phone.length < 9) {

        return jsonOutput({
          success: false,
          message: "Nomor telepon tidak valid."
        });
      }


      return jsonOutput({

        success: true,

        phone: phone,

        bookings: lookupBookings(
          phone
        )

      });
    }


    /* -----------------------------------------------
       ACTION TIDAK DIKENAL
       ----------------------------------------------- */

    return jsonOutput({

      success: false,

      message:
        "Action tidak dikenal. Gunakan health, slots, atau lookup."

    });


  } catch (err) {

    return jsonOutput({

      success: false,

      message:
        err && err.message
          ? err.message
          : "Terjadi kesalahan pada API."

    });

  }

}


/* =====================================================
   POST API - SIMPAN BOOKING
   ===================================================== */

function doPost(e) {

  const lock =
    LockService.getScriptLock();


  try {

    /*
     * Mencegah dua orang memesan
     * slot yang sama secara bersamaan.
     */

    lock.waitLock(15000);


    /* -----------------------------------------------
       AMBIL DATA
       ----------------------------------------------- */

    const record =
      parsePostData(e);


    if (!record) {

      return jsonOutput({

        success: false,

        message:
          "Data reservasi tidak ditemukan."

      });

    }


    /* -----------------------------------------------
       VALIDASI
       ----------------------------------------------- */

    validateRecord(record);


    /* -----------------------------------------------
       AMBIL SHEET
       ----------------------------------------------- */

    const sheet =
      getSheet();


    const values =
      sheet
        .getDataRange()
        .getValues();


    /* -----------------------------------------------
       CEGAH KODE BOOKING DUPLIKAT
       ----------------------------------------------- */

    const duplicateCode =
      values.some(function(row, index) {

        if (index === 0) {
          return false;
        }

        return (
          String(row[0] || "")
            .trim()
            .toUpperCase()
          ===
          String(record.code || "")
            .trim()
            .toUpperCase()
        );

      });


    if (duplicateCode) {

      return jsonOutput({

        success: false,

        message:
          "Kode booking sudah digunakan. Silakan coba lagi."

      });

    }


    /* -----------------------------------------------
       CEGAH DOUBLE BOOKING
       ----------------------------------------------- */

    const slotTaken =
      values.some(function(row, index) {

        if (index === 0) {
          return false;
        }


        const status =
          String(row[10] || "")
            .trim()
            .toLowerCase();


        // Booking dibatalkan tidak memblokir slot.
        if (
          status === "dibatalkan" ||
          status === "cancelled" ||
          status === "canceled"
        ) {

          return false;

        }


        const rowBarberId =
          String(row[5] || "")
            .trim();


        const rowDate =
          normalizeDate(row[6]);


        const rowTime =
          normalizeTime(row[7]);


        const bookingBarberId =
          String(record.barberId || "")
            .trim();


        const bookingDate =
          normalizeDate(record.date);


        const bookingTime =
          normalizeTime(record.time);


        return (

          rowBarberId === bookingBarberId

          &&

          rowDate === bookingDate

          &&

          rowTime === bookingTime

        );

      });


    if (slotTaken) {

      return jsonOutput({

        success: false,

        message:
          "Jam tersebut baru saja dipesan orang lain. Silakan pilih jam lain."

      });

    }


    /* -----------------------------------------------
       WAKTU PEMBUATAN
       ----------------------------------------------- */

    const createdAt =
      record.createdAt
        ? String(record.createdAt)
        : new Date().toISOString();


    /* -----------------------------------------------
       DATA YANG DISIMPAN
       ----------------------------------------------- */

    const servicesText =
      Array.isArray(record.services)

        ? record.services
            .map(function(service) {
              return String(service).trim();
            })
            .filter(Boolean)
            .join(", ")

        : String(
            record.services || ""
          ).trim();


    const total =
      Number(record.total) || 0;


    const status =
      String(
        record.status ||
        "Menunggu Konfirmasi"
      ).trim();


    /* -----------------------------------------------
       SIMPAN KE SPREADSHEET
       ----------------------------------------------- */

    sheet.appendRow([

      String(record.code).trim(),

      String(record.name).trim(),

      normalizePhone(record.phone),

      servicesText,

      String(record.barberName || "").trim(),

      String(record.barberId).trim(),

      normalizeDate(record.date),

      normalizeTime(record.time),

      total,

      String(record.notes || "").trim(),

      status,

      createdAt

    ]);


    SpreadsheetApp.flush();


    /* -----------------------------------------------
       RESPONSE
       ----------------------------------------------- */

    return jsonOutput({

      success: true,

      message:
        "Reservasi berhasil disimpan.",

      booking: {

        code:
          String(record.code).trim(),

        name:
          String(record.name).trim(),

        phone:
          normalizePhone(record.phone),

        services:
          Array.isArray(record.services)
            ? record.services
            : [servicesText],

        total:
          total,

        barberName:
          String(record.barberName || "").trim(),

        barberId:
          String(record.barberId).trim(),

        date:
          normalizeDate(record.date),

        dateLabel:
          formatDateLabel(
            normalizeDate(record.date)
          ),

        time:
          normalizeTime(record.time),

        notes:
          String(record.notes || "").trim(),

        status:
          status,

        createdAt:
          createdAt

      }

    });


  } catch (err) {

    return jsonOutput({

      success: false,

      message:
        err && err.message
          ? err.message
          : "Gagal menyimpan reservasi."

    });


  } finally {

    try {

      lock.releaseLock();

    } catch (_) {

      // Tidak melakukan apa-apa.

    }

  }

}


/* =====================================================
   PARSE DATA POST
   ===================================================== */

function parsePostData(e) {

  if (!e) {
    return null;
  }


  /*
   * FORMAT 1
   *
   * Vercel mengirim:
   *
   * data=JSON_STRING
   */

  if (
    e.parameter &&
    e.parameter.data
  ) {

    try {

      const parsed =
        JSON.parse(
          e.parameter.data
        );

      return parsed;

    } catch (error) {

      throw new Error(
        "Data reservasi JSON tidak valid."
      );

    }

  }


  /*
   * FORMAT 2
   *
   * Jika suatu saat Vercel
   * mengirim application/json.
   */

  if (
    e.postData &&
    e.postData.contents
  ) {

    const raw =
      String(
        e.postData.contents
      ).trim();


    if (!raw) {
      return null;
    }


    try {

      return JSON.parse(raw);

    } catch (error) {

      throw new Error(
        "Format JSON POST tidak valid."
      );

    }

  }


  return null;

}


/* =====================================================
   AMBIL SHEET
   ===================================================== */

function getSheet() {

  const ss =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );


  let sheet =
    ss.getSheetByName(
      SHEET_NAME
    );


  /*
   * Jika sheet "Reservasi"
   * belum ada, otomatis dibuat.
   */

  if (!sheet) {

    sheet =
      ss.insertSheet(
        SHEET_NAME
      );

  }


  setupSheet(sheet);


  return sheet;

}


/* =====================================================
   SETUP SHEET
   ===================================================== */

function setupSheet(sheet) {

  /*
   * Jika kosong,
   * buat header.
   */

  if (
    sheet.getLastRow() === 0
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        HEADERS.length
      )
      .setValues([
        HEADERS
      ]);

  }


  /*
   * Pastikan header sesuai.
   */

  const currentHeaders =
    sheet
      .getRange(
        1,
        1,
        1,
        HEADERS.length
      )
      .getValues()[0];


  const needsHeader =
    HEADERS.some(
      function(header, index) {

        return (
          String(
            currentHeaders[index] || ""
          ).trim()
          !==
          header
        );

      }
    );


  if (needsHeader) {

    sheet
      .getRange(
        1,
        1,
        1,
        HEADERS.length
      )
      .setValues([
        HEADERS
      ]);

  }


  /*
   * Bekukan baris pertama.
   */

  sheet.setFrozenRows(1);


  /*
   * Format kolom.
   */

  sheet
    .getRange("A:A")
    .setNumberFormat("@");


  sheet
    .getRange("C:C")
    .setNumberFormat("@");


  sheet
    .getRange("F:H")
    .setNumberFormat("@");


  sheet
    .getRange("I:I")
    .setNumberFormat(
      '"Rp" #,##0'
    );


  /*
   * Lebarkan kolom otomatis.
   */

  sheet.autoResizeColumns(
    1,
    HEADERS.length
  );

}


/* =====================================================
   VALIDASI BOOKING
   ===================================================== */

function validateRecord(record) {

  if (
    !record ||
    typeof record !== "object"
  ) {

    throw new Error(
      "Format data reservasi tidak valid."
    );

  }


  const required = [

    ["code", "Kode booking"],

    ["name", "Nama"],

    ["phone", "Nomor WhatsApp"],

    ["barberId", "Barber"],

    ["date", "Tanggal"],

    ["time", "Jam"]

  ];


  required.forEach(
    function(item) {

      const key =
        item[0];

      const label =
        item[1];


      if (
        !String(
          record[key] || ""
        ).trim()
      ) {

        throw new Error(
          label +
          " wajib diisi."
        );

      }

    }
  );


  /* -----------------------------------------------
     SERVICES
     ----------------------------------------------- */

  if (
    !Array.isArray(
      record.services
    )
    ||
    record.services.length === 0
  ) {

    throw new Error(
      "Minimal satu layanan harus dipilih."
    );

  }


  /* -----------------------------------------------
     DATE
     ----------------------------------------------- */

  const date =
    String(record.date).trim();


  if (
    !isValidDateFormat(date)
  ) {

    throw new Error(
      "Format tanggal tidak valid. Gunakan YYYY-MM-DD."
    );

  }


  /* -----------------------------------------------
     TIME
     ----------------------------------------------- */

  const time =
    String(record.time).trim();


  if (
    !isValidTimeFormat(time)
  ) {

    throw new Error(
      "Format jam tidak valid. Gunakan HH:mm."
    );

  }


  /* -----------------------------------------------
     PHONE
     ----------------------------------------------- */

  const phone =
    normalizePhone(
      record.phone
    );


  if (
    phone.length < 9
  ) {

    throw new Error(
      "Nomor WhatsApp tidak valid."
    );

  }

}


/* =====================================================
   CEK SLOT YANG SUDAH DIPESAN
   ===================================================== */

function getBookedSlots(
  barberId,
  date
) {

  const sheet =
    getSheet();


  const values =
    sheet
      .getDataRange()
      .getValues();


  const result = [];


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const row =
      values[i];


    const status =
      String(
        row[10] || ""
      )
        .trim()
        .toLowerCase();


    /*
     * Booking dibatalkan
     * tidak dihitung sebagai terisi.
     */

    if (
      status === "dibatalkan" ||
      status === "cancelled" ||
      status === "canceled"
    ) {

      continue;

    }


    const rowBarberId =
      String(
        row[5] || ""
      ).trim();


    const rowDate =
      normalizeDate(
        row[6]
      );


    const rowTime =
      normalizeTime(
        row[7]
      );


    if (

      rowBarberId ===
      String(barberId).trim()

      &&

      rowDate === date

      &&

      rowTime

      &&

      !result.includes(
        rowTime
      )

    ) {

      result.push(
        rowTime
      );

    }

  }


  return result;

}


/* =====================================================
   CARI BOOKING BERDASARKAN NOMOR HP
   ===================================================== */

function lookupBookings(phone) {

  const sheet =
    getSheet();


  const values =
    sheet
      .getDataRange()
      .getValues();


  const result = [];


  const targetPhone =
    normalizePhone(
      phone
    );


  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const row =
      values[i];


    const rowPhone =
      normalizePhone(
        row[2]
      );


    if (
      rowPhone !==
      targetPhone
    ) {

      continue;

    }


    const servicesText =
      String(
        row[3] || ""
      ).trim();


    const date =
      normalizeDate(
        row[6]
      );


    result.push({

      code:
        String(
          row[0] || ""
        ),

      name:
        String(
          row[1] || ""
        ),

      phone:
        rowPhone,

      services:
        servicesText
          ? servicesText.split(
              /\s*,\s*/
            )
          : [],

      barberName:
        String(
          row[4] || ""
        ),

      barberId:
        String(
          row[5] || ""
        ),

      date:
        date,

      dateLabel:
        formatDateLabel(
          date
        ),

      time:
        normalizeTime(
          row[7]
        ),

      total:
        Number(
          row[8]
        ) || 0,

      notes:
        String(
          row[9] || ""
        ),

      status:
        String(
          row[10] || ""
        ),

      createdAt:
        String(
          row[11] || ""
        )

    });

  }


  /*
   * Booking terbaru
   * ditampilkan paling atas.
   */

  return result.reverse();

}


/* =====================================================
   NORMALIZE NOMOR TELEPON
   ===================================================== */

function normalizePhone(value) {

  return String(
    value || ""
  )
    .replace(
      /\D/g,
      ""
    );

}


/* =====================================================
   NORMALIZE TANGGAL
   ===================================================== */

function normalizeDate(value) {

  /*
   * Jika Google Sheet memberikan
   * object Date.
   */

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(

      value,

      Session.getScriptTimeZone()
      || TIMEZONE,

      "yyyy-MM-dd"

    );

  }


  const text =
    String(
      value || ""
    ).trim();


  /*
   * Format yang kita gunakan:
   * YYYY-MM-DD
   */

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {

    return text;

  }


  return text;

}


/* =====================================================
   NORMALIZE JAM
   ===================================================== */

function normalizeTime(value) {

  /*
   * Jika nilai berupa Date,
   * ambil jam dan menit.
   */

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(

      value,

      Session.getScriptTimeZone()
      || TIMEZONE,

      "HH:mm"

    );

  }


  const text =
    String(
      value || ""
    ).trim();


  /*
   * Format HH:mm.
   */

  if (
    /^\d{1,2}:\d{2}$/.test(
      text
    )
  ) {

    const parts =
      text.split(":");


    return (
      String(
        Number(parts[0])
      ).padStart(2, "0")
      +
      ":" +
      parts[1]
    );

  }


  return text;

}


/* =====================================================
   VALIDASI FORMAT TANGGAL
   ===================================================== */

function isValidDateFormat(date) {

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(date)
    )
  );

}


/* =====================================================
   VALIDASI FORMAT JAM
   ===================================================== */

function isValidTimeFormat(time) {

  return (
    /^\d{2}:\d{2}$/.test(
      String(time)
    )
  );

}


/* =====================================================
   FORMAT LABEL TANGGAL
   ===================================================== */

function formatDateLabel(date) {

  if (
    !isValidDateFormat(date)
  ) {

    return date;

  }


  const parts =
    date.split("-");


  const months = [

    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des"

  ];


  const monthIndex =
    Number(
      parts[1]
    ) - 1;


  return (

    Number(parts[2])
    +
    " "
    +
    months[monthIndex]
    +
    " "
    +
    parts[0]

  );

}


/* =====================================================
   TEST KONEKSI SPREADSHEET
   ===================================================== */

function testConnection() {

  const sheet =
    getSheet();


  const result = {

    success: true,

    message:
      "Google Apps Script berhasil terhubung ke Spreadsheet.",

    spreadsheetId:
      SPREADSHEET_ID,

    sheet:
      sheet.getName(),

    headers:
      HEADERS,

    timestamp:
      new Date().toISOString()

  };


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/* =====================================================
   JSON RESPONSE
   ===================================================== */

function jsonOutput(data) {

  return ContentService

    .createTextOutput(
      JSON.stringify(
        data
      )
    )

    .setMimeType(
      ContentService.MimeType.JSON
    );

}