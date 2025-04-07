import express from "express"
import mongoose from "mongoose"
import dotenv from "dotenv"
import path from "path"
import bcrypt from "bcryptjs"
import { Parser } from "json2csv"
import { fileURLToPath } from "url"
import { dirname } from "path"
import fs from "fs"
import { sendVerificationEmail } from "./utils/emailService.js"
import nodemailer from "nodemailer"


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const tempDir = path.join(__dirname, "temp")
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}


dotenv.config()


import User from "./server/models/user.model.js"
import Survey from "./server/models/survey.model.js"
import Response from "./server/models/response.model.js"
import ReportGenerator from "./utils/reportGenerator.js"

const app = express()

// Middleware
app.use(express.json())
app.use(express.static("public"))

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://mongodb:27017/survey_app", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB")

    // Create admin user if it doesn't exist
    try {
      const adminExists = await User.findOne({ username: "admin" })
      console.log("Checking for admin user:", adminExists) // Debug log

      if (!adminExists) {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", 10)
        const adminUser = new User({
          username: "admin",
          password: hashedPassword,
          role: "admin",
          department: "Administration",
          email: "dataanalysis5@kisna.com",
          isEmailVerified: true, // Admin email is pre-verified
        })
        await adminUser.save()
        console.log("Admin user created successfully with hashed password:", hashedPassword)
      }
    } catch (error) {
      console.error("Error creating admin user:", error)
    }
  })
  .catch((err) => console.error("MongoDB connection error:", err))



async function generateCSV(csvPath) {
  try {
    const responses = await Response.find()
      .populate({
        path: "surveyId",
        select: "title questions department",
      })
      .lean()

    const formattedData = responses.map((response) => {
      const baseData = {
        "Survey Title": response.surveyId?.title || "Unknown Survey",
        Department: response.department || "Unknown Department",
        "Employee Name": response.userId,
        "Submission Date": new Date(response.timestamp).toLocaleDateString(),
        "Submission Time": new Date(response.timestamp).toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour12: true,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }

      if (response.surveyId?.questions) {
        response.surveyId.questions.forEach((question, index) => {
          const questionKey = `Question ${index + 1}`
          const answerKey = `Answer ${index + 1}`
          baseData[questionKey] = question.text
          // For star rating, show the number of stars (1-5)
          if (question.type === "star") {
            baseData[answerKey] = `${response.answers[`q${index}`]} stars`
          } else {
            baseData[answerKey] = response.answers[`q${index}`] || "No answer"
          }
        })
      }

      return baseData
    })

    const fields = ["Survey Title", "Department", "Employee Name", "Submission Date", "Submission Time"]

    const maxQuestions = Math.max(...responses.map((r) => r.surveyId?.questions?.length || 0))

    for (let i = 1; i <= maxQuestions; i++) {
      fields.push(`Question ${i}`, `Answer ${i}`)
    }

    const json2csvParser = new Parser({
      fields,
      excelStrings: true,
      header: true,
    })

    const csv = json2csvParser.parse(formattedData)
    await fs.promises.writeFile(csvPath, csv)

    return csvPath
  } catch (error) {
    console.error("Generate CSV error:", error)
    throw error
  }
}


function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, department, email } = req.body

    // Prevent admin creation through API
    if (username.toLowerCase() === "admin" || username.toLowerCase().includes("admin")) {
      return res.status(400).json({ error: "Invalid username" })
    }


    const existingEmail = await User.findOne({ email })
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const otp = generateOTP()
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    const user = new User({
      username,
      password: hashedPassword,
      role: "employee",
      department,
      email,
      emailVerificationOTP: otp,
      otpExpires,
      isEmailVerified: false,
    })

    await user.save()


    await sendVerificationEmail(email, otp)

    res.json({
      success: true,
      message: "Please check your email for verification OTP",
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})


app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body

    const user = await User.findOne({ username })
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    if (!user.isEmailVerified) {
      return res.status(401).json({
        error: "Please verify your email before logging in",
      })
    }


    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    res.json({
      user: {
        username,
        role: user.role,
        department: user.department,
        email: user.email,
      },
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})


app.post("/api/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body

    const user = await User.findOne({
      email,
      emailVerificationOTP: otp,
      otpExpires: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired OTP",
      })
    }

    user.isEmailVerified = true
    user.emailVerificationOTP = null
    user.otpExpires = null
    await user.save()

    res.json({
      success: true,
      message: "Email verified successfully",
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})


app.get("/api/departments", async (req, res) => {
  try {
    // Fetch unique departments from your database using mongoose
    const departments = await User.distinct("department")
    res.json(departments)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch departments" })
  }
})


app.post("/api/surveys", async (req, res) => {
  try {
    const surveyData = req.body

    // Validate questions
    surveyData.questions.forEach((question) => {
      if (question.type === "star") {
        // Ensure star rating questions don't have custom options
        delete question.options
      }
    })

    if (surveyData.isAllDepartments) {
      const survey = new Survey({
        title: surveyData.title,
        department: "all",
        questions: surveyData.questions,
        isAllDepartments: true,
      })
      await survey.save()
      res.json({ success: true, survey })
    } else {
      const survey = new Survey({
        title: surveyData.title,
        department: surveyData.department,
        questions: surveyData.questions,
        isAllDepartments: false,
      })
      await survey.save()
      res.json({ success: true, survey })
    }
  } catch (error) {
    console.error("Survey creation error:", error)
    res.status(400).json({ error: error.message })
  }
})

app.get("/api/surveys/all", async (req, res) => {
  try {
    const surveys = await Survey.find({})
    res.json(surveys)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch surveys" })
  }
})

app.get("/api/surveys/:department", async (req, res) => {
  try {
    const query = {
      $or: [{ department: req.params.department }, { isAllDepartments: true }],
    }
    const surveys = await Survey.find(query)
    res.json(surveys)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch surveys" })
  }
})


app.delete("/api/surveys/:id", async (req, res) => {
  try {
    const surveyId = req.params.id


    const deletedSurvey = await Survey.findByIdAndDelete(surveyId)

    if (!deletedSurvey) {
      return res.status(404).json({ error: "Survey not found" })
    }


    await Response.deleteMany({ surveyId: surveyId })

    res.json({ success: true, message: "Survey deleted successfully" })
  } catch (error) {
    console.error("Delete survey error:", error)
    res.status(500).json({ error: "Failed to delete survey" })
  }
})


app.post("/api/responses", async (req, res) => {
  try {
    const response = new Response(req.body)
    await response.save()
    res.json(response)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.get("/api/responses/user/:username", async (req, res) => {
  try {
    const responses = await Response.find({ userId: req.params.username })
    res.json(responses)
  } catch (error) {
    res.status(500).json({ error: "Error fetching user responses" })
  }
})

app.get("/api/responses/export", async (req, res) => {
  try {
    const responses = await Response.find()
      .populate({
        path: "surveyId",
        select: "title questions department",
      })
      .lean()

    const formattedData = responses.map((response) => {
      const baseData = {
        "Survey Title": response.surveyId?.title || "Unknown Survey",
        Department: response.department || "Unknown Department",
        "Employee Name": response.userId,
        "Submission Date": new Date(response.timestamp).toLocaleDateString(),
        "Submission Time": new Date(response.timestamp).toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour12: true,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }


      if (response.surveyId?.questions) {
        response.surveyId.questions.forEach((question, index) => {
          const questionKey = `Question ${index + 1}`
          const answerKey = `Answer ${index + 1}`
          baseData[questionKey] = question.text
          // The answer is already a comma-separated string for checkboxes
          baseData[answerKey] = response.answers[`q${index}`] || "No answer"
        })
      }

      return baseData
    })

    const fields = ["Survey Title", "Department", "Employee Name", "Submission Date", "Submission Time"]

    const maxQuestions = Math.max(...responses.map((r) => r.surveyId?.questions?.length || 0))

    for (let i = 1; i <= maxQuestions; i++) {
      fields.push(`Question ${i}`, `Answer ${i}`)
    }

    const json2csvParser = new Parser({
      fields,
      excelStrings: true,
      header: true,
    })

    const csv = json2csvParser.parse(formattedData)

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", 'attachment; filename="survey_responses.csv"')
    res.status(200).send(csv)
  } catch (error) {
    console.error("Export error:", error)
    res.status(500).json({ error: "Failed to export responses" })
  }
})


app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!" })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})


app.get("/api/responses/analysis", async (req, res) => {
  try {

    const csvPath = path.join(tempDir, `responses_${Date.now()}.csv`)


    await generateCSV(csvPath)


    const generator = new ReportGenerator(csvPath)
    await generator.initialize()

    // Generate analysis
    const analysis = await generator.generateAnalysis()

    // Generate PDF
    const pdfPath = await generator.generatePDF(analysis)

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF file was not generated")
    }

    res.download(pdfPath, "survey_analysis.pdf", (err) => {
      if (err) {
        console.error("Download error:", err)
        return res.status(500).json({ error: "Failed to download analysis" })
      }


      fs.unlink(pdfPath, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting PDF:", unlinkErr)
      })
      fs.unlink(csvPath, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting CSV:", unlinkErr)
      })
    })
  } catch (error) {
    console.error("Analysis generation error:", error)
    res.status(500).json({ error: "Failed to generate analysis" })
  }
})


async function sendPasswordResetEmail(email, resetCode) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {

        rejectUnauthorized: false,
      },
    })

    console.log(`Attempting to send password reset email to: ${email}`)

    const mailOptions = {
      from: `"Survey App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <h1>Password Reset Request</h1>
        <p>Your password reset code is: <strong>${resetCode}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this reset, please ignore this email.</p>
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`Password reset email sent successfully: ${info.messageId}`)
  } catch (error) {
    console.error("Send password reset email error:", error)
    throw error
  }
}


app.post("/api/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ error: "No account found with this email" })
    }

    const resetCode = generateOTP() // Using existing OTP generator
    const resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    user.passwordResetCode = resetCode
    user.resetCodeExpires = resetCodeExpires
    await user.save()

    await sendPasswordResetEmail(email, resetCode)

    res.json({
      success: true,
      message: "Password reset code has been sent to your email",
    })
  } catch (error) {
    console.error("Password reset request error:", error)
    res.status(500).json({ error: "Failed to process password reset request" })
  }
})


app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body

    const user = await User.findOne({
      email,
      passwordResetCode: resetCode,
      resetCodeExpires: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired reset code",
      })
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedPassword
    user.passwordResetCode = null
    user.resetCodeExpires = null
    await user.save()

    res.json({
      success: true,
      message: "Password has been reset successfully",
    })
  } catch (error) {
    console.error("Password reset error:", error)
    res.status(500).json({ error: "Failed to reset password" })
  }
})


app.get("/api/verify-session", async (req, res) => {
  try {

    res.json({ success: true })
  } catch (error) {
    res.status(401).json({ error: "Invalid session" })
  }
})


app.post("/api/logout", (req, res) => {

  res.json({ success: true })
})

