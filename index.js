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

    // TEXT FIELDS
    try { form.getTextField("WorksiteName").setText(fmt(d.worksiteName)); } catch (e) { console.log("Missing field: WorksiteName"); }
    try { form.getTextField("EEName").setText(fmt(d.employeeName)); } catch (e) { console.log("Missing field: EEName"); }
    try { form.getTextField("EEAddress").setText(fmt(d.employeeAddress1)); } catch (e) { console.log("Missing field: EEAddress"); }
    try { form.getTextField("EEAddress2").setText(fmt(d.employeeAddress2)); } catch (e) { console.log("Missing field: EEAddress2"); }
    try { form.getTextField("SSN").setText(fmt(d.ssn)); } catch (e) { console.log("Missing field: SSN"); }
    try { form.getTextField("LDW").setText(fmt(d.lastDayWorked)); } catch (e) { console.log("Missing field: LDW"); }
    try { form.getTextField("DateOfTerm").setText(fmt(d.dateOfTermination)); } catch (e) { console.log("Missing field: DateOfTerm"); }
    try { form.getTextField("FINALINCIDENT").setText(fmt(d.finalIncident)); } catch (e) { console.log("Missing field: FINALINCIDENT"); }
    try { form.getTextField("REMARKS").setText(fmt(d.remarks)); } catch (e) { console.log("Missing field: REMARKS"); }

    // SUPERVISOR FIELDS
    try { form.getTextField("SupNamePrint").setText(fmt(d.supervisorName)); } catch (e) { console.log("Missing field: SupNamePrint"); }
    try { form.getTextField("SupSig").setText(fmt(d.supervisorSignature)); } catch (e) { console.log("Missing field: SupSig"); }
    try { form.getTextField("SupDate").setText(fmt(d.supervisorDate)); } catch (e) { console.log("Missing field: SupDate"); }

    // REASON CHECKBOXES
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

    // MARK ALL THAT APPLY CHECKBOXES
    if (d.flags?.wagesInLieu) {
      try { form.getCheckBox("wagesinlieuofnotice").check(); } catch (e) { console.log("Missing checkbox: wagesinlieuofnotice"); }
    }

    if (d.flags?.severanceOnFile) {
      try { form.getCheckBox("severance").check(); } catch (e) { console.log("Missing checkbox: severance"); }
    }

    if (d.flags?.severancePaid) {
      try { form.getCheckBox("severancepd").check(); } catch (e) { console.log("Missing checkbox: severancepd"); }
    }

    if (d.flags?.loaOnFile) {
      try { form.getCheckBox("loa").check(); } catch (e) { console.log("Missing checkbox: loa"); }
    }

    if (d.flags?.ptoPaid) {
      try { form.getCheckBox("PTO").check(); } catch (e) { console.log("Missing checkbox: PTO"); }
    }

    if (d.flags?.incidentDocs) {
      try { form.getCheckBox("incident").check(); } catch (e) { console.log("Missing checkbox: incident"); }
    }

    if (d.flags?.sepWagesReported) {
      try { form.getCheckBox("sepwages").check(); } catch (e) { console.log("Missing checkbox: sepwages"); }
    }

    // IMPORTANT:
    // Update field appearances so values stay visible in the saved PDF
    form.updateFieldAppearances();

    // TEMPORARILY DISABLED:
    // Flattening can make the PDF look blank if appearance streams are not preserved correctly
    // form.flatten();

    const finalPdf = await pdfDoc.save();

    const safeName = (d.employeeName || "Employee")
      .replace(/[^\w\s-]/g, "")
      .trim() || "Employee";

    const formData = new FormData();
    formData.append(
      "content",
      `📄 Separation Notice generated for **${d.employeeName || "Employee"}**`
    );
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
