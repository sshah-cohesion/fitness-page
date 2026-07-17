const fs = require("fs");
const path = require("path");
const { PKPass } = require("passkit-generator");

const ASSETS = path.join(process.cwd(), "pass-assets");

function b64Env(name) {
  const v = process.env[name];
  if (!v) return null;
  return Buffer.from(v, "base64");
}

function configured() {
  return Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_WWDR_BASE64 &&
    process.env.APPLE_SIGNER_CERT_BASE64 &&
    process.env.APPLE_SIGNER_KEY_BASE64
  );
}

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS, name));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function buildPassJson(body) {
  const kind = body.kind === "event" ? "event" : "gym";
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_ID;
  const teamIdentifier = process.env.APPLE_TEAM_ID;
  const serialNumber = String(body.serialNumber || (kind + "-" + Date.now()));
  const barcodeMessage = String(body.code || body.serialNumber || serialNumber);

  const base = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber,
    organizationName: body.building || "125 Park Avenue",
    description: body.description || (kind === "event" ? "Fitness event ticket" : "Fitness access pass"),
    logoText: "Fitness",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(76, 91, 212)",
    labelColor: "rgb(230, 235, 255)",
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: barcodeMessage,
        messageEncoding: "iso-8859-1",
        altText: body.memberId || body.title || "Access",
      },
    ],
    barcode: {
      format: "PKBarcodeFormatQR",
      message: barcodeMessage,
      messageEncoding: "iso-8859-1",
      altText: body.memberId || body.title || "Access",
    },
  };

  if (kind === "event") {
    base.eventTicket = {
      primaryFields: [
        { key: "event", label: "EVENT", value: body.title || "Fitness Event" },
      ],
      secondaryFields: [
        { key: "when", label: "WHEN", value: body.when || "" },
        { key: "where", label: "WHERE", value: body.place || "" },
      ],
      auxiliaryFields: [
        { key: "building", label: "BUILDING", value: body.building || "125 Park Avenue" },
      ],
      backFields: [
        { key: "notes", label: "Notes", value: body.description || "Show this pass at check-in." },
      ],
    };
    if (body.relevantDate) base.relevantDate = body.relevantDate;
  } else {
    base.storeCard = {
      primaryFields: [
        { key: "member", label: "MEMBER ID", value: body.memberId || "TENANT" },
      ],
      secondaryFields: [
        { key: "gym", label: "GYM", value: body.name || "Building Fitness" },
      ],
      auxiliaryFields: [
        { key: "location", label: "LOCATION", value: body.location || "" },
        { key: "status", label: "STATUS", value: "Active" },
      ],
      backFields: [
        {
          key: "info",
          label: "Access",
          value: "Present this pass at the gym entrance. Complimentary tenant access for " +
            (body.building || "125 Park Avenue") + ".",
        },
      ],
    };
  }

  return base;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({ configured: configured() });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!configured()) {
    res.status(501).json({
      error: "not_configured",
      message: "Apple Wallet certificates are not set on this deployment. Add APPLE_* env vars in Vercel.",
    });
    return;
  }

  try {
    const body = parseBody(req);
    const passJson = buildPassJson(body);

    const certificates = {
      wwdr: b64Env("APPLE_WWDR_BASE64"),
      signerCert: b64Env("APPLE_SIGNER_CERT_BASE64"),
      signerKey: b64Env("APPLE_SIGNER_KEY_BASE64"),
      signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
    };

    const pass = new PKPass(
      {
        "pass.json": Buffer.from(JSON.stringify(passJson)),
        "icon.png": readAsset("icon.png"),
        "paula.r@example.org": readAsset("paula.r@example.org"),
        "logo.png": readAsset("logo.png"),
      },
      certificates
    );

    pass.setBarcodes({
      message: String(body.code || body.serialNumber || passJson.serialNumber),
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
      altText: body.memberId || body.title || "Access",
    });

    const buffer = pass.getAsBuffer();
    const filename = (body.kind === "event" ? "event" : "gym") + "-pass.pkpass";

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.status(200).send(buffer);
  } catch (err) {
    console.error("wallet-pass error", err);
    res.status(500).json({
      error: "pass_failed",
      message: err && err.message ? err.message : "Failed to create pass",
    });
  }
};
