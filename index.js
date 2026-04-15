import express from "express";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import fetch from "node-fetch";
import FormData from "form-data";

const app = express();
app.use(express.json({ limit: "10mb" }));

const FIELD_MAP = {
  "Quit": "001QUIT",
  "Accepted another position": "002ACCEPTED",
  "Medical (non-FMLA)": "003MEDICAL",
  "Relocating": "004RELOCATING",
  "Personal / Family": "005PERSONAL/FAMILY(NOTFMLA)",
  "Left to attend school": "006LEFTSCHOOL",
  "No Call / No Show": "007NC/NS",
  "End of seasonal/temp employment": "008ENDOFSEASON",
  "Military School": "009MILITARYSCHOOL",
  "Failure to return from leave": "010FAILRETURN",
  "Job Transfer Refusal": "011JOBTRANSFER REFUSAL",
  "Job Dissatisfaction": "012JOBDISSATISFACTION",
  "Other (Voluntary)": "014OTHER",
  "Military (Non-USERRA)": "016MILITARY",

  "Insubordination": "200INSUBORDINATION",
  "Repeated tardiness / absenteeism": "201REPEATEDTARDINESS/ABSENTEEISM",
  "Falsified application": "202FALSIFIEDAPP",
  "Policy violation": "203POLICYVIOLATION",
  "Performance issues": "204PERFISSUES",
  "Sleeping on the job": "205SLEEPING",
  "Foul / abusive language": "206FOULLANG",
  "Destruction of company property": "207PROPDESTRUCTION",
  "Initial employment period (fit)": "208PROBPERIOD",
  "Drug-free workplace violation": "209DRUGFREEVIOLATION",
  "Dishonesty / Theft": "210DISHONEST/THEFT",
  "Lack of work / laid off": "211LAIDOFF",
  "Other (Involuntary)": "214OTHER",
  "Loss of work authorization": "215LOSSWORKAUTH",
  "Refused work assignment": "216REFUSEDWORK",
  "Co-employment ended": "018COEMPLOYEND"
};

function fmt(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

app.get("/", (req, res) => {
  res.send("Offboarding PDF bot is running.");
});

app.post("/generate", async (req, res) => {
  try {
    const d = req.body;

    const existingPdfBytes = fs.readFileSync("./template.pdf");
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    form.getTextField("WorksiteName").setText(fmt(d.worksiteName));
    form.getTextField("EEName").setText(fmt(d.employeeName));
    form.getTextField("EEAddress").setText(fmt(d.employeeAddress1));
    form.getTextField("EEAddress2").setText(fmt(d.employeeAddress2));
    form.getTextField("SSN").setText(fmt(d.ssn));
    form.getTextField("LDW").setText(fmt(d.lastDayWorked));
    form.getTextField("DateOfTerm").setText(fmt(d.dateOfTermination));
    form.getTextField("FINALINCIDENT").setText(fmt(d.finalIncident));
    form.getTextField("REMARKS").setText(fmt(d.remarks));

    form.getTextField("SupNamePrint").setText(fmt(d.supervisorName));
    form.getTextField("SupSig").setText(fmt(d.supervisorSignature));
    form.getTextField("SupDate").setText(fmt(d.supervisorDate));

    const allReasons = [
      ...(d.voluntaryReasons || []),
      ...(d.involuntaryReasons || [])
    ];

    for (const reason of allReasons) {
      const field = FIELD_MAP[reason];
      if (field) {
        try {
          form.getCheckBox(field).check();
        } catch (e) {
          console.log(`Checkbox not found: ${field}`);
        }
      }
    }

    if (d.flags?.wagesInLieu) {
      try { form.getCheckBox("wagesinlieuofnotice").check(); } catch {}
    }
    if (d.flags?.severanceOnFile) {
      try { form.getCheckBox("severance").check(); } catch {}
    }
    if (d.flags?.severancePaid) {
      try { form.getCheckBox("severancepd").check(); } catch {}
    }
    if (d.flags?.loaOnFile) {
      try { form.getCheckBox("loa").check(); } catch {}
    }
    if (d.flags?.ptoPaid) {
      try { form.getCheckBox("PTO").check(); } catch {}
    }
    if (d.flags?.incidentDocs) {
      try { form.getCheckBox("incident").check(); } catch {}
    }
    if (d.flags?.sepWagesReported) {
      try { form.getCheckBox("sepwages").check(); } catch {}
    }

    try { form.getTextField("wagesinlieuofnotice_amount").setText(fmt(d.wagesAmount)); } catch {}
    try { form.getTextField("severancepd_amount").setText(fmt(d.severanceAmount)); } catch {}
    try { form.getTextField("PTO_days").setText(fmt(d.ptoDays)); } catch {}
    try { form.getTextField("PTO_amount").setText(fmt(d.ptoAmount)); } catch {}

    form.flatten();

    const finalPdf = await pdfDoc.save();
    const safeName = (d.employeeName || "Employee").replace(/[^\w\s-]/g, "").trim() || "Employee";

    const formData = new FormData();
    formData.append("content", `📄 Separation Notice generated for **${d.employeeName || "Employee"}**`);
    formData.append("file", Buffer.from(finalPdf), {
      filename: `Separation Notice - ${safeName}.pdf`,
      contentType: "application/pdf"
    });

    const discordResponse = await fetch(process.env.DISCORD_WEBHOOK, {
      method: "POST",
      body: formData
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      throw new Error(`Discord upload failed: ${discordResponse.status} ${text}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
