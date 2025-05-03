import fs from "fs"
import PDFDocument from "pdfkit"
import csv from "csv-parser"
import Chart from "chart.js/auto"
import { createCanvas } from "canvas"
import path from "path"

class ReportGenerator {
  constructor(csvPath) {
    this.csvPath = csvPath
    this.data = []
    this.d3 = null
  }

  async readCSV() {
    // Check if file exists first
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(`CSV file not found at path: ${this.csvPath}`)
    }

    return new Promise((resolve, reject) => {
      const results = []
      fs.createReadStream(this.csvPath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          if (results.length === 0) {
            reject(new Error("CSV file is empty"))
          } else {
            resolve(results)
          }
        })
        .on("error", (error) => reject(error))
    })
  }
  generateOverview(data) {
    try {
      // Calculate total responses
      const totalResponses = data.length

      // Get unique departments
      const departments = new Set(data.map((row) => row["Department"])).size

      // Calculate average satisfaction rate
      let satisfactionCount = 0
      let totalSatisfactionResponses = 0

      data.forEach((row) => {
        // Look for satisfaction-related questions
        Object.keys(row).forEach((key) => {
          if (key.startsWith("Answer")) {
            const answer = row[key].toLowerCase()
            if (this.isSatisfactionQuestion(row[`Question ${key.split(" ")[1]}`])) {
              totalSatisfactionResponses++
              if (this.isPositiveSatisfactionResponse(answer)) {
                satisfactionCount++
              }
            }
          }
        })
      })

      const averageSatisfactionRate =
        totalSatisfactionResponses > 0 ? (satisfactionCount / totalSatisfactionResponses) * 100 : 0

      return {
        totalResponses,
        departments,
        averageSatisfactionRate,
      }
    } catch (error) {
      console.error("Error generating overview:", error)
      return {
        totalResponses: 0,
        departments: 0,
        averageSatisfactionRate: 0,
      }
    }
  }
  isSatisfactionQuestion(question) {
    if (!question) return false
    const questionLower = question.toLowerCase()
    return questionLower.includes("satisf") || questionLower.includes("happy") || questionLower.includes("content")
  }
  isPositiveSatisfactionResponse(answer) {
    const positiveResponses = ["very satisfied", "satisfied", "very happy", "happy", "excellent", "good"]
    return positiveResponses.some(
      (response) => answer.includes(response) && !answer.includes("not") && !answer.includes("dis"),
    )
  }

  async initialize() {
    try {
      this.d3 = await import("d3-array")
    } catch (error) {
      console.error("Error loading d3-array:", error)
      throw error
    }
  }

  async analyze() {
    try {
      const responses = await this.loadResponses()
      const satisfactionRate = this.calculateSatisfactionRate(responses)

      // Group responses by department
      const departmentResponses = {}
      responses.forEach((response) => {
        const dept = response.department || "Unknown"
        if (!departmentResponses[dept]) {
          departmentResponses[dept] = []
        }
        departmentResponses[dept].push(response)
      })

      // Calculate department-wise stats
      const departmentStats = Object.entries(departmentResponses)
        .map(([dept, deptResponses]) => {
          const deptSatisfactionRate = this.calculateSatisfactionRate(deptResponses)
          return `${dept}: ${deptSatisfactionRate}% Satisfaction (${deptResponses.length} responses)`
        })
        .join("\n")

      return {
        totalResponses: responses.length,
        satisfactionRate,
        departmentStats,
        departmentResponses,
      }
    } catch (error) {
      console.error("Analysis error:", error)
      throw error
    }
  }

  // Update the generateAnalysis method
  async generateAnalysis() {
    try {
      const responses = await this.readCSV()
      const departments = [...new Set(responses.map((r) => r["Department"]))]

      // Calculate overall satisfaction metrics across all responses
      const overallMetrics = this.calculateSatisfactionPercentage(responses)

      // Process department-wise statistics and find department with highest dissatisfaction
      let highestDissatisfactionDept = ""
      let highestDissatisfactionRate = 0

      departments.forEach((dept) => {
        const deptResponses = responses.filter((r) => r["Department"] === dept)
        const deptMetrics = this.calculateSatisfactionPercentage(deptResponses)

        if (deptMetrics.dissatisfaction > highestDissatisfactionRate) {
          highestDissatisfactionRate = deptMetrics.dissatisfaction
          highestDissatisfactionDept = dept
        }
      })

      const analysis = {
        overview: {
          totalResponses: responses.length,
          numberOfDepartments: departments.length,
          averageSatisfaction: `${overallMetrics.satisfaction}%`,
          averageDissatisfaction: `${overallMetrics.dissatisfaction}%`,
          departmentWithHighestDissatisfaction: highestDissatisfactionDept ? `${highestDissatisfactionDept}` : "None",
          highestDissatisfactionRate: highestDissatisfactionRate,
        },
        departmentStats: {},
      }

      // Process department-wise statistics
      departments.forEach((dept) => {
        const deptResponses = responses.filter((r) => r["Department"] === dept)

        // Analyze questions for this department
        const questionAnalysis = {}
        deptResponses.forEach((response) => {
          Object.keys(response).forEach((key) => {
            if (key.startsWith("Question")) {
              const qNum = key.split(" ")[1]
              const answerKey = `Answer ${qNum}`
              const question = response[key]
              const answer = response[answerKey]

              if (!questionAnalysis[qNum]) {
                questionAnalysis[qNum] = {
                  question: question,
                  responses: {},
                  responseCount: 0,
                  type: this.determineQuestionType(answer),
                }
              }

              // Handle different types of questions
              if (this.isStarRatingQuestion(question, [answer])) {
                questionAnalysis[qNum].type = "StarRating"
                questionAnalysis[qNum].responses = {
                  ...questionAnalysis[qNum].responses,
                  [answer]: (questionAnalysis[qNum].responses[answer] || 0) + 1,
                }
              } else if (answer.includes(",")) {
                // Handle checkbox questions
                const options = answer.split(",").map((opt) => opt.trim())
                options.forEach((opt) => {
                  questionAnalysis[qNum].responses[opt] = (questionAnalysis[qNum].responses[opt] || 0) + 1
                })
                questionAnalysis[qNum].type = "Checkbox"
              } else {
                // Handle MCQ and text questions
                questionAnalysis[qNum].responses[answer] = (questionAnalysis[qNum].responses[answer] || 0) + 1
                if (!questionAnalysis[qNum].type) {
                  questionAnalysis[qNum].type = this.isMCQQuestion([answer]) ? "MCQ" : "Text"
                }
              }
              questionAnalysis[qNum].responseCount++
            }
          })
        })

        analysis.departmentStats[dept] = {
          totalResponses: deptResponses.length,
          questionAnalysis: questionAnalysis,
        }
      })

      return analysis
    } catch (error) {
      console.error("Analysis generation error:", error)
      throw error
    }
  }

  isMCQQuestion(answers) {
    const commonOptions = ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
    return answers.every((answer) => commonOptions.includes(answer) || answer === "No answer")
  }
  isCheckboxQuestion(answers) {
    return answers.some((answer) => answer.includes(","))
  }

  // Add this new method to identify star rating questions
  isStarRatingQuestion(question, answers) {
    if (!question || !answers) return false

    // Check if answers match the star rating pattern
    const starPattern = /^\d+\s*stars?$/i
    const hasStarFormat = answers.some((answer) => answer && starPattern.test(answer.trim()))

    return hasStarFormat
  }

  // Replace the existing calculateAverageStarRating method
  calculateAverageStarRating(responses) {
    const validResponses = responses.filter((response) => {
      if (!response || typeof response !== "string") return false
      const numberMatch = response.match(/(\d+)\s*stars?/i)
      return numberMatch !== null
    })

    if (validResponses.length === 0) return "0.0"

    const sum = validResponses.reduce((total, response) => {
      const numberMatch = response.match(/(\d+)\s*stars?/i)
      const stars = Number.parseInt(numberMatch[1])
      return isNaN(stars) ? total : total + stars
    }, 0)

    return (sum / validResponses.length).toFixed(1)
  }

  // Update the generatePDF method to include the new visualizations
  // Replace the existing generatePDF method with this enhanced version

  async generatePDF(analysis) {
    try {
      // Validate analysis object
      if (!analysis) {
        analysis = await this.generateAnalysis()
      }

      // Set default values
      const defaultAnalysis = {
        overview: {
          totalResponses: 0,
          departments: 0,
          averageSatisfactionRate: 0,
        },
        departmentStats: {},
        questionAnalysis: {},
      }

      // Merge with defaults
      analysis = {
        ...defaultAnalysis,
        ...analysis,
        overview: {
          ...defaultAnalysis.overview,
          ...(analysis?.overview || {}),
        },
      }

      const doc = new PDFDocument({
        autoFirstPage: true,
        size: "A4",
        margin: 50,
        info: {
          Title: "Survey Analysis Report",
          Author: "Survey Analysis System",
          Subject: "Survey Results and Analysis",
          Keywords: "survey, analysis, satisfaction, departments",
        },
      })

      const outputPath = path.join(path.dirname(this.csvPath), "..", "reports", "survey_analysis.pdf")

      // Ensure reports directory exists
      const reportsDir = path.dirname(outputPath)
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
      }

      const stream = fs.createWriteStream(outputPath)
      doc.pipe(stream)

      // Cover page
      doc.fontSize(28).text("Survey Analysis Report", { align: "center" })
      doc.moveDown()
      doc.fontSize(14).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: "center" })
      doc.moveDown(2)

      // Add a simple border
      doc
        .lineWidth(2)
        .rect(50, 50, doc.page.width - 100, doc.page.height - 100)
        .stroke() // Uncomment this line to draw the border

      doc.addPage()

      // Table of contents
      doc.fontSize(20).text("Table of Contents", { align: "center" })
      doc.moveDown()
      doc
        .fontSize(12)
        .text("1. Executive Summary", { link: "executive-summary" })
        .text("2. Department Analysis", { link: "department-analysis" })
        .text("3. Question Analysis", { link: "question-analysis" })
        .text("4. Visualizations", { link: "visualizations" })
      // .text("5. Satisfaction Calculation Methodology", { link: "satisfaction-methodology" })

      doc.addPage()

      // Executive Summary
      doc.addNamedDestination("executive-summary")
      doc.fontSize(20).text("1. Executive Summary", { align: "center" })
      doc.moveDown()

      // Overview section
      doc.fontSize(16).text("Overview")
      doc
        .fontSize(12)
        .text(`Total Responses: ${analysis.overview.totalResponses}`)
        .text(`Number of Departments: ${analysis.overview.numberOfDepartments}`)
        .text(`Overall Satisfaction: ${analysis.overview.averageSatisfaction}`)
        .text(`Overall Dissatisfaction: ${analysis.overview.averageDissatisfaction}`)
        .text(`Department with Highest Dissatisfaction: ${analysis.overview.departmentWithHighestDissatisfaction}`)
      doc.moveDown(2)

      // Key findings
      doc.fontSize(16).text("Key Findings")
      doc.fontSize(12)

      // Generate some key findings based on the data
      const departments = Object.keys(analysis.departmentStats)
      if (departments.length > 0) {
        // Find department with highest response rate
        const highestResponseDept = departments.reduce((prev, curr) =>
          analysis.departmentStats[curr].totalResponses > analysis.departmentStats[prev].totalResponses ? curr : prev,
        )

        doc.text(
          `• ${highestResponseDept} had the highest response rate with ${analysis.departmentStats[highestResponseDept].totalResponses} responses.`,
        )

        // Add more key findings
        doc.text(`• Overall satisfaction across all departments is ${analysis.overview.averageSatisfaction}.`)
        doc.text(`• ${analysis.overview.departmentWithHighestDissatisfaction} department is highly dissatisfied.`)
      }

      doc.moveDown(2)

      // Department Analysis
      doc.addPage()
      doc.addNamedDestination("department-analysis")
      doc.fontSize(20).text("2. Department Analysis", { align: "center" })
      doc.moveDown()

      // Department Statistics section
      Object.entries(analysis.departmentStats).forEach(([department, stats]) => {
        doc.fontSize(16).text(`Department: ${department}`)
        doc.fontSize(12).text(`Total Responses: ${stats.totalResponses}`)

        // Calculate department satisfaction
        let satisfactionScore = 0
        let totalQuestions = 0

        Object.values(stats.questionAnalysis).forEach((qData) => {
          if (qData.type === "MCQ") {
            let questionSatisfaction = 0
            let questionResponses = 0

            const weights = {
              "Very Satisfied": 100,
              Satisfied: 75,
              Neutral: 50,
              Dissatisfied: 25,
              "Very Dissatisfied": 0,
            }

            Object.entries(qData.responses).forEach(([response, count]) => {
              if (weights[response] !== undefined) {
                questionSatisfaction += weights[response] * count
                questionResponses += count
              }
            })

            if (questionResponses > 0) {
              satisfactionScore += questionSatisfaction / questionResponses
              totalQuestions++
            }
          }
        })

        const avgSatisfaction = totalQuestions > 0 ? (satisfactionScore / totalQuestions).toFixed(1) + "%" : "N/A"

        doc.text(`Department Satisfaction: ${avgSatisfaction}`)
        doc.moveDown()

        doc.text("----------------------------------------")
        doc.moveDown()
      })

      // Question Analysis
      doc.addPage()
      doc.addNamedDestination("question-analysis")
      doc.fontSize(20).text("3. Question Analysis", { align: "center" })
      doc.moveDown()

      // Find all questions across departments
      const allQuestions = []

      Object.entries(analysis.departmentStats).forEach(([dept, deptData]) => {
        Object.entries(deptData.questionAnalysis).forEach(([qNum, qData]) => {
          // Include all question types
          allQuestions.push({
            question: qData.question,
            department: dept,
            type: qData.type,
            data: qData,
          })
        })
      })

      // Sort by question text to group similar questions
      allQuestions.sort((a, b) => a.question.localeCompare(b.question))

      // Display analysis for important questions
      allQuestions.slice(0, 15).forEach((item, index) => {
        doc.fontSize(14).text(`${index + 1}. ${item.question}`)
        doc.fontSize(12).text(`Department: ${item.department}`)
        // Removed Question Type display

        if (item.type === "MCQ") {
          doc.text("Option Counts:")
          Object.entries(item.data.responses).forEach(([option, count]) => {
            const percentage = ((count / item.data.responseCount) * 100).toFixed(1)
            doc.text(`${option}: ${count} responses (${percentage}%)`)
          })
        } else if (item.type === "Checkbox") {
          // Display checkbox responses with counts
          doc.text("Selected Options:")
          Object.entries(item.data.responses).forEach(([option, count]) => {
            const percentage = ((count / item.data.responseCount) * 100).toFixed(1)
            doc.text(`• ${option}: ${count} selections (${percentage}%)`)
          })
        } else if (item.type === "StarRating") {
          for (let stars = 5; stars >= 1; stars--) {
            const count = item.data.responses[`${stars} stars`] || 0
            doc.text(`${stars} star${stars !== 1 ? "s" : ""}: ${count} selections`)
          }

          // Calculate and display average rating
          let totalStars = 0
          let totalResponses = 0
          Object.entries(item.data.responses).forEach(([response, count]) => {
            const stars = Number.parseInt(response)
            if (!isNaN(stars)) {
              totalStars += stars * count
              totalResponses += count
            }
          })
          const averageRating = totalResponses > 0 ? (totalStars / totalResponses).toFixed(1) : "N/A"
          doc.moveDown()
          doc.text(`Average Star Rating: ${averageRating}`)
        } else if (item.type === "Text") {
          // Display text responses
          doc.text("Text Responses:")
          const responses = Object.keys(item.data.responses).slice(0, 5) // Limit to 5 responses
          responses.forEach((response) => {
            if (response && response !== "No answer") {
              doc.text(`• "${response}"`)
            }
          })
          if (Object.keys(item.data.responses).length > 5) {
            doc.text(`... and ${Object.keys(item.data.responses).length - 5} more responses`)
          }
        }

        doc.moveDown(2)
      })

      // Visualizations
      doc.addPage()
      doc.addNamedDestination("visualizations")
      doc.fontSize(20).text("4. Visualizations", { align: "center" })
      doc.moveDown()

      // Satisfaction Distribution Pie Chart
      doc.fontSize(16).text("Satisfaction Distribution", { align: "center" })
      doc.moveDown()

      const satisfactionData = this.aggregateSatisfactionLevels(analysis)
      const pieChartCanvas = await this.createSatisfactionPieChart(satisfactionData)
      const pieChartBuffer = pieChartCanvas.toBuffer("image/png")

      doc.image(pieChartBuffer, {
        fit: [500, 300],
        align: "center",
      })

      doc.moveDown(2)
      doc.addPage()

      // Department Comparative Analysis (replacing Department Performance Matrix)
      doc.fontSize(16).text("Department Comparative Analysis", { align: "center" })
      doc.moveDown()

      const comparativeChartCanvas = await this.createDepartmentComparativeAnalysis(analysis)
      const comparativeChartBuffer = comparativeChartCanvas.toBuffer("image/png")

      doc.image(comparativeChartBuffer, {
        fit: [500, 300],
        align: "center",
      })

      doc.moveDown(2)
      doc.addPage()

      // Department Response Distribution Analysis
      doc.fontSize(16).text("Department Response Distribution Analysis", { align: "center" })
      doc.moveDown()

      const responsePatternCanvas = await this.createDepartmentResponsePatterns(analysis)
      const responsePatternBuffer = responsePatternCanvas.toBuffer("image/png")

      doc.image(responsePatternBuffer, {
        fit: [500, 300],
        align: "center",
      })

      doc.moveDown(2)
      doc.addPage()

      // Question Sentiment Analysis (with improved color naming)
      doc.fontSize(16).text("Question Sentiment Analysis", { align: "center" })
      doc.moveDown()

      const impactChartCanvas = await this.createQuestionImpactAnalysis(analysis)
      if (impactChartCanvas) {
        const impactChartBuffer = impactChartCanvas.toBuffer("image/png")

        doc.image(impactChartBuffer, {
          fit: [500, 400],
          align: "center",
        })
      } else {
        doc.text("No significant sentiment data available for analysis.", { align: "center" })
      }

      doc.end()

      return new Promise((resolve, reject) => {
        stream.on("finish", () => resolve(outputPath))
        stream.on("error", reject)
      })
    } catch (error) {
      console.error("PDF Generation Error:", error)
      throw new Error(`Failed to generate PDF: ${error.message}`)
    }
  }

  async generateCharts(analysis) {
    const canvas = createCanvas(800, 400)
    const ctx = canvas.getContext("2d")

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: analysis.departmentStats.map((d) => d.department),
        datasets: [
          {
            label: "Satisfaction Rate by Department",
            data: analysis.departmentStats.map((d) => d.satisfactionRate),
            backgroundColor: "rgba(54, 162, 235, 0.5)",
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
      },
    })

    return canvas
  }

  calculateSatisfactionRate(responses) {
    let totalResponses = 0
    let satisfiedCount = 0

    responses.forEach((response) => {
      Object.values(response.answers).forEach((answer) => {
        if (typeof answer === "string") {
          const lowerAnswer = answer.toLowerCase()
          // Check for satisfaction-related responses
          if (lowerAnswer.includes("satisf") || lowerAnswer.includes("happy") || lowerAnswer.includes("good")) {
            totalResponses++

            // Count as satisfied only if positive response
            if (
              !lowerAnswer.includes("not") &&
              !lowerAnswer.includes("dis") &&
              (lowerAnswer.includes("very satisf") ||
                lowerAnswer.includes("quite satisf") ||
                lowerAnswer.includes("very happy") ||
                lowerAnswer.includes("very good"))
            ) {
              satisfiedCount++
            }
          }
        }
      })
    })

    return totalResponses > 0 ? Math.round((satisfiedCount / totalResponses) * 100) : 0
  }

  calculateOverallSatisfactionRate() {
    return this.calculateSatisfactionRate(this.data)
  }

  analyzeQuestions() {
    if (!this.d3) return {}

    const questions = {}
    this.data.forEach((response) => {
      for (const [key, value] of Object.entries(response)) {
        if (key.startsWith("Question")) {
          if (!questions[key]) {
            questions[key] = {
              text: value,
              responses: [],
            }
          }
          const answerKey = `Answer ${key.split(" ")[1]}`
          questions[key].responses.push(response[answerKey])
        }
      }
    })

    return questions
  }

  async loadResponses() {
    return new Promise((resolve, reject) => {
      const responses = []
      fs.createReadStream(this.csvPath)
        .pipe(csv())
        .on("data", (data) => {
          // Transform CSV data into response format
          const response = {
            department: data.Department,
            answers: {},
          }

          // Extract questions and answers
          Object.keys(data).forEach((key) => {
            if (key.startsWith("Question")) {
              const questionNumber = key.split(" ")[1]
              const answerKey = `Answer ${questionNumber}`
              response.answers[`q${questionNumber}`] = data[answerKey]
            }
          })

          responses.push(response)
        })
        .on("end", () => {
          this.data = responses // Store the data for other methods to use
          resolve(responses)
        })
        .on("error", (error) => {
          reject(error)
        })
    })
  }

  calculateSatisfactionPercentage(responses) {
    let satisfactionScore = 0
    let dissatisfactionScore = 0
    let satisfactionQuestions = 0
    let dissatisfactionQuestions = 0

    responses.forEach((response) => {
      Object.keys(response).forEach((key) => {
        if (key.startsWith("Answer")) {
          const answer = response[key]
          const questionKey = `Question ${key.split(" ")[1]}`
          const question = response[questionKey]

          if (!answer || !question) return

          // Handle star ratings
          const starMatch = answer.match(/(\d+)\s*stars?/i)
          if (starMatch) {
            const stars = Number.parseInt(starMatch[1])
            if (!isNaN(stars)) {
              if (stars >= 3) {
                satisfactionScore += (stars / 5) * 100
                satisfactionQuestions++
              } else {
                dissatisfactionScore += ((5 - stars) / 5) * 100
                dissatisfactionQuestions++
              }
            }
          }
          // Handle satisfaction-based responses
          else {
            const satisfactionLevels = {
              "Very Satisfied": 100,
              Satisfied: 75,
              Neutral: 50,
              Dissatisfied: 25,
              "Very Dissatisfied": 0,
            }

            const answerKey = answer.trim()
            if (satisfactionLevels.hasOwnProperty(answerKey)) {
              if (["Very Satisfied", "Satisfied"].includes(answerKey)) {
                satisfactionScore += satisfactionLevels[answerKey]
                satisfactionQuestions++
              } else if (["Dissatisfied", "Very Dissatisfied"].includes(answerKey)) {
                dissatisfactionScore += 100 - satisfactionLevels[answerKey]
                dissatisfactionQuestions++
              }
            }
          }
        }
      })
    })

    return {
      satisfaction: satisfactionQuestions > 0 ? Math.round(satisfactionScore / satisfactionQuestions) : 0,
      dissatisfaction: dissatisfactionQuestions > 0 ? Math.round(dissatisfactionScore / dissatisfactionQuestions) : 0,
    }
  }

  // Add this helper method
  determineQuestionType(answer) {
    if (answer.match(/(\d+)\s*stars?/i)) return "StarRating"
    if (answer.includes(",")) return "Checkbox"
    if (["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"].includes(answer)) return "MCQ"
    return "Text"
  }

  // Add this method after calculateSatisfactionPercentage
  aggregateSatisfactionLevels(analysis) {
    const satisfactionCounts = {
      "Very Satisfied": 0,
      Satisfied: 0,
      Neutral: 0,
      Dissatisfied: 0,
      "Very Dissatisfied": 0,
    }

    Object.values(analysis.departmentStats).forEach((deptData) => {
      Object.values(deptData.questionAnalysis).forEach((qData) => {
        if (qData.type === "MCQ") {
          Object.entries(qData.responses).forEach(([response, count]) => {
            if (satisfactionCounts.hasOwnProperty(response)) {
              satisfactionCounts[response] += count
            }
          })
        }
      })
    })

    return satisfactionCounts
  }

  // Add this method after aggregateSatisfactionLevels
  async createSatisfactionPieChart(satisfactionData) {
    const canvas = createCanvas(600, 400)
    const ctx = canvas.getContext("2d")

    // Calculate total responses for percentage
    const total = Object.values(satisfactionData).reduce((a, b) => a + b, 0)

    const chart = new Chart(ctx, {
      type: "pie",
      data: {
        // Create labels with counts and percentages
        labels: Object.entries(satisfactionData).map(([key, value]) => {
          const percentage = ((value / total) * 100).toFixed(1)
          return `${key}: ${value} (${percentage}%)`
        }),
        datasets: [
          {
            data: Object.values(satisfactionData),
            backgroundColor: [
              "rgba(75, 192, 192, 0.8)", // Very Satisfied - Teal
              "rgba(54, 162, 235, 0.8)", // Satisfied - Blue
              "rgba(255, 206, 86, 0.8)", // Neutral - Yellow
              "rgba(255, 159, 64, 0.8)", // Dissatisfied - Orange
              "rgba(255, 99, 132, 0.8)", // Very Dissatisfied - Red
            ],
            borderColor: "#ffffff",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "black",
              font: {
                size: 12,
              },
              // Ensure labels don't get cut off
              padding: 20,
            },
          },
          title: {
            display: true,
            text: "Overall Satisfaction Distribution",
            color: "black",
            font: {
              size: 16,
            },
            padding: 20,
          },
          // Add tooltips configuration
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw
                const percentage = ((value / total) * 100).toFixed(1)
                return `${context.label}: ${value} responses (${percentage}%)`
              },
            },
          },
        },
      },
    })

    return canvas
  }

  // Create a department comparative analysis visualization (replacing Department Performance Matrix)
  async createDepartmentComparativeAnalysis(analysis) {
    const canvas = createCanvas(800, 500)
    const ctx = canvas.getContext("2d")

    // Extract department data
    const departments = Object.keys(analysis.departmentStats)

    // Calculate metrics for each department
    const satisfactionData = []
    const dissatisfactionData = []
    const responseRates = []

    departments.forEach((dept) => {
      const deptData = analysis.departmentStats[dept]

      // Calculate satisfaction and dissatisfaction for this department
      const deptMetrics = this.calculateDepartmentSatisfactionMetrics(deptData)

      satisfactionData.push(deptMetrics.satisfaction)
      dissatisfactionData.push(deptMetrics.dissatisfaction)

      // Calculate response rate as percentage of total questions answered
      const totalQuestions = Object.keys(deptData.questionAnalysis).length
      const answeredQuestions = Object.values(deptData.questionAnalysis).reduce(
        (sum, q) => sum + (q.responseCount > 0 ? 1 : 0),
        0,
      )
      const responseRate = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0

      responseRates.push(responseRate)
    })

    // Create the grouped bar chart
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: departments,
        datasets: [
          {
            label: "Satisfaction Score",
            data: satisfactionData,
            backgroundColor: "rgba(75, 192, 192, 0.7)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
          {
            label: "Dissatisfaction Score",
            data: dissatisfactionData,
            backgroundColor: "rgba(255, 99, 132, 0.7)",
            borderColor: "rgba(255, 99, 132, 1)",
            borderWidth: 1,
          },
          {
            label: "Response Rate",
            data: responseRates,
            backgroundColor: "rgba(54, 162, 235, 0.7)",
            borderColor: "rgba(54, 162, 235, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: "Score (%)",
              font: {
                size: 14,
                weight: "bold",
              },
            },
          },
          x: {
            title: {
              display: true,
              text: "Departments",
              font: {
                size: 14,
                weight: "bold",
              },
            },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Department Comparative Analysis",
            font: {
              size: 18,
              weight: "bold",
            },
            padding: 20,
          },
          legend: {
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${context.raw.toFixed(1)}%`
              },
            },
          },
        },
      },
    })

    return canvas
  }

  // Helper method for department comparative analysis
  calculateDepartmentSatisfactionMetrics(deptData) {
    let satisfactionScore = 0
    let dissatisfactionScore = 0
    let satisfactionCount = 0
    let dissatisfactionCount = 0

    Object.values(deptData.questionAnalysis).forEach((qData) => {
      if (qData.type === "MCQ") {
        const weights = {
          "Very Satisfied": 100,
          Satisfied: 75,
          Neutral: 50,
          Dissatisfied: 25,
          "Very Dissatisfied": 0,
        }

        Object.entries(qData.responses).forEach(([response, count]) => {
          if (weights[response] !== undefined) {
            if (["Very Satisfied", "Satisfied"].includes(response)) {
              satisfactionScore += weights[response] * count
              satisfactionCount += count
            } else if (["Dissatisfied", "Very Dissatisfied"].includes(response)) {
              dissatisfactionScore += (100 - weights[response]) * count
              dissatisfactionCount += count
            }
          }
        })
      } else if (qData.type === "StarRating") {
        Object.entries(qData.responses).forEach(([response, count]) => {
          const starMatch = response.match(/(\d+)\s*stars?/i)
          if (starMatch) {
            const stars = Number.parseInt(starMatch[1])
            if (!isNaN(stars)) {
              if (stars >= 4) {
                satisfactionScore += (stars / 5) * 100 * count
                satisfactionCount += count
              } else if (stars <= 2) {
                dissatisfactionScore += ((5 - stars) / 5) * 100 * count
                dissatisfactionCount += count
              }
            }
          }
        })
      }
    })

    return {
      satisfaction: satisfactionCount > 0 ? Math.round(satisfactionScore / satisfactionCount) : 0,
      dissatisfaction: dissatisfactionCount > 0 ? Math.round(dissatisfactionScore / dissatisfactionCount) : 0,
    }
  }

  // Create a sunburst chart to visualize department response patterns
  async createDepartmentResponsePatterns(analysis) {
    const canvas = createCanvas(800, 600)
    const ctx = canvas.getContext("2d")

    // Get departments and prepare data
    const departments = Object.keys(analysis.departmentStats)

    // Prepare data for stacked bar chart showing response patterns
    const responseTypes = ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
    const datasets = []

    // Create a dataset for each response type
    responseTypes.forEach((type, index) => {
      const data = []
      const colors = [
        "rgba(75, 192, 192, 0.8)", // Very Satisfied - Teal
        "rgba(54, 162, 235, 0.8)", // Satisfied - Blue
        "rgba(255, 206, 86, 0.8)", // Neutral - Yellow
        "rgba(255, 159, 64, 0.8)", // Dissatisfied - Orange
        "rgba(255, 99, 132, 0.8)", // Very Dissatisfied - Red
      ]

      // Calculate counts for each department
      departments.forEach((dept) => {
        let typeCount = 0
        let totalCount = 0

        Object.values(analysis.departmentStats[dept].questionAnalysis).forEach((qData) => {
          if (qData.type === "MCQ") {
            Object.entries(qData.responses).forEach(([response, count]) => {
              if (response === type) {
                typeCount += count
              }
              totalCount += count
            })
          }
        })

        // Calculate percentage
        const percentage = totalCount > 0 ? (typeCount / totalCount) * 100 : 0
        data.push(percentage)
      })

      datasets.push({
        label: type,
        data: data,
        backgroundColor: colors[index],
        borderColor: colors[index].replace("0.8", "1"),
        borderWidth: 1,
      })
    })

    // Create the stacked bar chart
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: departments,
        datasets: datasets,
      },
      options: {
        responsive: false,
        scales: {
          x: {
            stacked: true,
            title: {
              display: true,
              text: "Departments",
              font: {
                size: 14,
                weight: "bold",
              },
            },
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "Response Distribution (%)",
              font: {
                size: 14,
                weight: "bold",
              },
            },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Department Response Distribution Analysis",
            font: {
              size: 18,
              weight: "bold",
            },
            padding: 20,
          },
          legend: {
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw.toFixed(1)
                return `${context.dataset.label}: ${value}%`
              },
            },
          },
        },
      },
    })

    return canvas
  }

  // Create a new Question Sentiment Analysis visualization with improved color naming
  async createQuestionImpactAnalysis(analysis) {
    const canvas = createCanvas(800, 600)
    const ctx = canvas.getContext("2d")

    // Collect all questions across departments
    const questionData = []

    Object.entries(analysis.departmentStats).forEach(([dept, deptData]) => {
      Object.entries(deptData.questionAnalysis).forEach(([qNum, qData]) => {
        if (qData.type === "MCQ" || qData.type === "StarRating") {
          // Calculate sentiment score (-100 to +100)
          let positiveResponses = 0
          let negativeResponses = 0
          let totalResponses = 0

          if (qData.type === "MCQ") {
            Object.entries(qData.responses).forEach(([response, count]) => {
              if (response === "Very Satisfied" || response === "Satisfied") {
                positiveResponses += count
              } else if (response === "Dissatisfied" || response === "Very Dissatisfied") {
                negativeResponses += count
              }
              totalResponses += count
            })
          } else if (qData.type === "StarRating") {
            Object.entries(qData.responses).forEach(([response, count]) => {
              const starMatch = response.match(/(\d+)\s*stars?/i)
              if (starMatch) {
                const stars = Number.parseInt(starMatch[1])
                if (stars >= 4) {
                  positiveResponses += count
                } else if (stars <= 2) {
                  negativeResponses += count
                }
                totalResponses += count
              }
            })
          }

          const sentimentScore =
            totalResponses > 0 ? ((positiveResponses - negativeResponses) / totalResponses) * 100 : 0

          // Calculate response volume (percentage of total responses)
          const responseVolume = totalResponses

          // Truncate question text if too long
          const questionText = qData.question.length > 30 ? qData.question.substring(0, 27) + "..." : qData.question

          questionData.push({
            question: questionText,
            fullQuestion: qData.question,
            department: dept,
            sentimentScore,
            responseVolume,
            type: qData.type,
          })
        }
      })
    })

    // Sort by response volume for better visualization
    questionData.sort((a, b) => b.responseVolume - a.responseVolume)

    // Take top 10 questions by response volume
    const topQuestions = questionData.slice(0, 10)

    // Define sentiment categories with proper naming
    const getSentimentCategory = (score) => {
      if (score > 75) return { category: "Very Positive", color: "rgba(75, 192, 192, 0.7)" }
      if (score > 25) return { category: "Positive", color: "rgba(102, 187, 106, 0.7)" }
      if (score > -25) return { category: "Neutral", color: "rgba(255, 206, 86, 0.7)" }
      if (score > -75) return { category: "Negative", color: "rgba(255, 159, 64, 0.7)" }
      return { category: "Very Negative", color: "rgba(255, 99, 132, 0.7)" }
    }

    // Create horizontal bar chart
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: topQuestions.map((q) => q.question),
        datasets: [
          {
            label: "Sentiment Score",
            data: topQuestions.map((q) => q.sentimentScore),
            backgroundColor: topQuestions.map((q) => getSentimentCategory(q.sentimentScore).color),
            borderColor: "rgba(0, 0, 0, 0.1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: false,
        scales: {
          x: {
            title: {
              display: true,
              text: "Sentiment Score (-100 to +100)",
              font: {
                size: 14,
                weight: "bold",
              },
            },
            min: -100,
            max: 100,
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Question Sentiment Analysis",
            font: {
              size: 18,
              weight: "bold",
            },
            padding: 20,
          },
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              title: (tooltipItems) => {
                const index = tooltipItems[0].dataIndex
                return topQuestions[index].fullQuestion
              },
              label: (context) => {
                const index = context.dataIndex
                const q = topQuestions[index]
                const sentiment = getSentimentCategory(q.sentimentScore)
                return [
                  `Department: ${q.department}`,
                  `Sentiment: ${sentiment.category}`,
                  `Sentiment Score: ${q.sentimentScore.toFixed(1)}`,
                  `Response Volume: ${q.responseVolume}`,
                ]
              },
            },
          },
        },
      },
    })

    // Add a legend for sentiment categories
    const legendY = 550
    const legendX = 100
    const legendSpacing = 120
    const legendColors = [
      { category: "Very Positive", color: "rgba(75, 192, 192, 0.7)" },
      { category: "Positive", color: "rgba(102, 187, 106, 0.7)" },
      { category: "Neutral", color: "rgba(255, 206, 86, 0.7)" },
      { category: "Negative", color: "rgba(255, 159, 64, 0.7)" },
      { category: "Very Negative", color: "rgba(255, 99, 132, 0.7)" },
    ]

    legendColors.forEach((item, index) => {
      const x = legendX + index * legendSpacing

      // Draw color box
      ctx.fillStyle = item.color
      ctx.fillRect(x, legendY, 15, 15)
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"
      ctx.strokeRect(x, legendY, 15, 15)

      // Draw text
      ctx.fillStyle = "black"
      ctx.font = "12px Arial"
      ctx.fillText(item.category, x + 20, legendY + 12)
    })

    return canvas
  }
}

export default ReportGenerator
