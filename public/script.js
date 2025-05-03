let currentUser = null
let sessionTimeout


// Replace the checkLoginState function with this improved version
function checkLoginState() {
  const user = JSON.parse(localStorage.getItem("user"))
  if (user && user.username) {
    // Instead of making a server request that might fail, use the stored user data
    document.getElementById("login-container").classList.add("hidden")
    document.getElementById("signup-container").classList.add("hidden")
    document.getElementById("forgot-password-container")?.classList.add("hidden")
    document.getElementById("reset-verification-container")?.classList.add("hidden")
    document.getElementById("verification-container")?.classList.add("hidden")

    // Show the navbar logout button
    document.getElementById("navbar-logout").classList.remove("hidden")

    if (user.role === "admin") {
      document.getElementById("admin-panel").classList.remove("hidden")
      loadDepartmentSurveys()
    } else {
      document.getElementById("employee-panel").classList.remove("hidden")
      loadAvailableSurveys()
    }

    // Restart the session timeout
    startSession()

    return true
  }

  // Hide the navbar logout button when not logged in
  document.getElementById("navbar-logout").classList.add("hidden")
  return false
}

// Session management
function startSession() {
  clearSession()
  sessionTimeout = setTimeout(
    () => {
      logout()
    },
    30 * 60 * 1000,
  ) // 30 minutes
}

function clearSession() {
  if (sessionTimeout) {
    clearTimeout(sessionTimeout)
  }
}

// Password validation
function validatePassword(password) {
  const minLength = 8
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*]/.test(password)

  return password.length >= minLength && hasUpper && hasLower && hasNumber && hasSpecial
}

// Add these new functions
function validateEmail(email) {
  // More permissive regex that allows various email formats
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return re.test(email)
}

window.verifyEmail = async () => {
  const email = sessionStorage.getItem("pendingVerificationEmail")
  const otpInput = document.getElementById("otp-input")
  const otp = otpInput.value.trim()

  if (!email || !otp) {
    alert("Please enter the verification code")
    return
  }

  try {
    const response = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    })

    const data = await response.json()

    if (data.success) {
      // Clear OTP field
      otpInput.value = ""
      alert("Email verified successfully! Please login.")
      sessionStorage.removeItem("pendingVerificationEmail")
      document.getElementById("verification-container").classList.add("hidden")
      showLogin()
    } else {
      // Clear OTP field on failure too
      otpInput.value = ""
      alert(data.error || "Verification failed")
    }
  } catch (error) {
    // Clear OTP field on error
    otpInput.value = ""
    console.error("Verification error:", error)
    alert("Verification failed: " + error.message)
  }
}

window.resendOTP = async () => {
  const email = sessionStorage.getItem("pendingVerificationEmail")

  if (!email) {
    alert("Please try signing up again")
    showSignup()
    return
  }

  try {
    const response = await fetch("/api/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (data.success) {
      alert("New verification code sent to your email")
    } else {
      alert(data.error || "Failed to resend verification code")
    }
  } catch (error) {
    console.error("Resend OTP error:", error)
    alert("Failed to resend verification code: " + error.message)
  }
}

// Show/Hide Forms
window.showSignup = () => {
  // Clear login form fields
  document.getElementById("username").value = ""
  document.getElementById("password").value = ""

  // Switch views
  document.getElementById("login-container").classList.add("hidden")
  document.getElementById("signup-container").classList.remove("hidden")
}

window.showLogin = () => {
  // Clear all signup form fields
  document.getElementById("new-username").value = ""
  document.getElementById("new-password").value = ""
  document.getElementById("new-email").value = ""
  document.getElementById("new-department").value = document.getElementById("new-department").options[0].value
  document.getElementById("new-tenure").value = document.getElementById("new-tenure").options[0].value
  document.getElementById("new-employee-id").value = ""

  // Switch views
  document.getElementById("signup-container").classList.add("hidden")
  document.getElementById("login-container").classList.remove("hidden")
}

// Update the signup function to skip OTP verification and show success message directly
window.signup = async () => {
  const username = document.getElementById("new-username").value.trim().toLowerCase()
  const password = document.getElementById("new-password").value
  const email = document.getElementById("new-email").value.trim()
  const department = document.getElementById("new-department").value
  const employeeId = document.getElementById("new-employee-id").value.trim()
  const tenure = document.getElementById("new-tenure").value

  if (!username || !password || !department || !email || !employeeId || !tenure) {
    alert("Please fill in all required fields")
    return
  }

  if (username.toLowerCase() === "admin" || username.toLowerCase().includes("admin")) {
    alert("This username is not allowed")
    return
  }

  if (!validatePassword(password)) {
    alert(
      "Password must be at least 8 characters long and contain uppercase, lowercase, numbers and special characters",
    )
    return
  }

  if (!validateEmail(email)) {
    alert("Please enter a valid email address")
    return
  }

  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, department, email, employeeId, tenure }),
    })

    const data = await response.json()

    if (data.success) {
      // Clear all signup form fields
      document.getElementById("new-username").value = ""
      document.getElementById("new-password").value = ""
      document.getElementById("new-email").value = ""
      document.getElementById("new-employee-id").value = ""

      // Only try to reset these if they exist and have a default option
      const deptSelect = document.getElementById("new-department")
      if (deptSelect && deptSelect.options.length > 0) {
        deptSelect.selectedIndex = 0
      }

      const tenureSelect = document.getElementById("new-tenure")
      if (tenureSelect && tenureSelect.options.length > 0) {
        tenureSelect.selectedIndex = 0
      }

      // Show success message
      const signupContainer = document.getElementById("signup-container")
      signupContainer.innerHTML = `
        <div class="success-message">
          <h4><i class="fas fa-check-circle"></i> Signup Successful!</h4>
          <p>Your account has been created successfully.</p>
          <button onclick="redirectToLogin()" class="btn">Go to Login</button>
        </div>
      `
    } else {
      alert(data.error || "Sign up failed")
    }
  } catch (error) {
    console.error("Signup error:", error)
    alert("Sign up failed: " + error.message)
  }
}

// Add a new function to handle the redirect to login
window.redirectToLogin = () => {
  // Hide the signup container with success message
  document.getElementById("signup-container").classList.add("hidden")

  // Show the login container
  document.getElementById("login-container").classList.remove("hidden")

  // Reset the signup container to its original state for future use
  const signupContainer = document.getElementById("signup-container")
  signupContainer.innerHTML = `
    <h2>Sign Up</h2>
    <div class="signup-form">
      <input type="text" id="new-username" placeholder="Username" autocomplete="off"/>
      <input type="email" id="new-email" placeholder="Email" required autocomplete="off"/>
      <input type="text" id="new-employee-id" placeholder="Employee ID" required autocomplete="off"/>
      <input type="password" id="new-password" placeholder="Password" autocomplete="off"/>
      <select id="new-department" required>
        <option value="" disabled selected>Select Department</option>
        ${DEPARTMENTS.map((dept) => `<option value="${dept.value}">${dept.label}</option>`).join("")}
      </select>
      <select id="new-tenure" required>
        <option value="" disabled selected>Select Tenure</option>
        <option value="0-6 months">0-6 months</option>
        <option value="up to 1 year">up to 1 year</option>
        <option value="Less than 5 years">Less than 5 years</option>
        <option value="more than 5 years">more than 5 years</option>
      </select>
      <button onclick="signup()" class="signup-button">Sign Up</button>
      <div class="form-footer-wrapper">
        <span>Already have an account?</span>
        <button onclick="showLogin()" class="link-button">Login</button>
      </div>
    </div>
  `

  // Reload departments in the signup form
  loadDepartments()
}

// Update the login function to properly store user data
// In your client-side script.js
async function login() {
  const username = document.getElementById("username").value.trim().toLowerCase()
  const password = document.getElementById("password").value

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    })
    const data = await response.json()

    if (response.ok) {
      // Store user data in localStorage with all necessary information
      localStorage.setItem("user", JSON.stringify(data.user))

      currentUser = data.user
      startSession()

      // Show the navbar logout button immediately after login
      document.getElementById("navbar-logout").classList.remove("hidden")

      document.getElementById("login-container").classList.add("hidden")
      document.getElementById("signup-container").classList.add("hidden")

      if (currentUser.role === "admin") {
        document.getElementById("admin-panel").classList.remove("hidden")
        await loadDepartmentSurveys()
      } else {
        document.getElementById("employee-panel").classList.remove("hidden")
        await loadAvailableSurveys()
      }
    } else {
      alert(data.error || "Invalid credentials!")
    }
  } catch (error) {
    console.error("Login error:", error)
    alert("Login failed: " + error.message)
  }
}

// Add this function to handle question deletion
function deleteQuestion(button) {
  const questionsContainer = document.getElementById("questions-container")
  const questionInputs = questionsContainer.getElementsByClassName("question-input")

  // Only delete if there's more than one question
  if (questionInputs.length > 1) {
    const questionDiv = button.closest(".question-input")

    // If this question has options, remove them too
    const optionsContainer = questionDiv.querySelector(".options-container")
    if (optionsContainer) {
      optionsContainer.remove()
    }

    // Remove the question div
    questionDiv.remove()
  } else {
    alert("Cannot delete the last question. At least one question is required.")
  }
}

function addOptions(button) {
  const questionDiv = button.parentElement
  const questionType = questionDiv.querySelector(".question-type").value

  // Don't show options for text or star rating questions
  if (questionType === "text" || questionType === "star") {
    return
  }

  // Remove existing options container if it exists
  const existingOptions = questionDiv.querySelector(".options-container")
  if (existingOptions) {
    existingOptions.remove()
  }

  // Create new options container
  const optionsContainer = document.createElement("div")
  optionsContainer.className = "options-container"
  optionsContainer.innerHTML = `
        <div class="option-input-group">
            <input type="text" class="options-input" placeholder="Enter option" />
            <button onclick="addNewOption(this)" class="add-option-btn">+</button>
        </div>
        <span class="options-help">Add your options here. Click + to add more options.</span>
    `

  questionDiv.appendChild(optionsContainer)
}

// Add an event listener to handle question type changes
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("question-type")) {
    const addOptionsButton = e.target.parentElement.querySelector("button")
    if (e.target.value === "text" || e.target.value === "star") {
      addOptionsButton.style.display = "none"
    } else {
      addOptionsButton.style.display = "inline-block"
    }
  }
})

function addNewOption(button) {
  const optionsContainer = button.closest(".options-container")
  const newOptionGroup = document.createElement("div")
  newOptionGroup.className = "option-input-group"
  newOptionGroup.innerHTML = `
        <input type="text" class="options-input" placeholder="Enter option" />
        <button onclick="removeOption(this)" class="remove-option-btn">-</button>
    `
  optionsContainer.insertBefore(newOptionGroup, optionsContainer.querySelector(".options-help"))
}

function removeOption(button) {
  button.closest(".option-input-group").remove()
}

// Update your existing addQuestion function to include the delete button
function addQuestion() {
  const questionsContainer = document.getElementById("questions-container")
  const newQuestion = document.createElement("div")
  newQuestion.className = "question-input"
  newQuestion.innerHTML = `
        <input type="text" placeholder="Question" class="question" />
        <select class="question-type">
            <option value="text">Text</option>
            <option value="radio">Multiple Choice</option>
            <option value="checkbox">Checkbox</option>
            <option value="star">Star Rating</option>
        </select>
        <button onclick="addOptions(this)">Add Options</button>
        <button onclick="deleteQuestion(this)" class="delete-btn">❌</button>
    `
  questionsContainer.appendChild(newQuestion)
}
// Handle question type change
window.handleQuestionTypeChange = (select) => {
  const optionsContainer = select.parentElement.querySelector(".options-container")
  if (select.value === "radio" || select.value === "checkbox") {
    optionsContainer.classList.remove("hidden")
  } else {
    optionsContainer.classList.add("hidden")
  }
}
// Add option function
window.addOption = (button) => {
  const optionsInput = button.previousElementSibling
  const currentOptions = optionsInput.value ? optionsInput.value.split(",") : []
  const newOption = prompt("Enter option:")

  if (newOption && newOption.trim()) {
    currentOptions.push(newOption.trim())
    optionsInput.value = currentOptions.join(",")
  }
}

// Load Department Surveys
async function loadDepartmentSurveys() {
  try {
    // Get all available departments
    const deptResponse = await fetch("/api/departments")
    const allDepartments = await deptResponse.json()

    const container = document.getElementById("department-surveys")
    let html = ""

    // Fetch and display surveys for each department
    for (const dept of allDepartments) {
      const response = await fetch(`/api/surveys/${dept}`)
      const surveys = await response.json()

      // Filter out duplicate all-department surveys
      const uniqueSurveys = surveys.filter(
        (survey, index, self) => index === self.findIndex((s) => s._id === survey._id),
      )

      if (uniqueSurveys.length > 0) {
        html += `
                    <div class="department-section">
                        <h4>${dept}</h4>
                        ${uniqueSurveys
                          .map(
                            (survey) => `
                            <div class="survey-card">
                                <h5>${survey.title}</h5>
                                <p>Department: ${survey.isAllDepartments ? "All Departments" : survey.department}</p>
                                <button onclick="deleteSurvey('${survey._id}')" class="delete-button">Delete Survey</button>
                            </div>
                        `,
                          )
                          .join("")}
                    </div>
                `
      }
    }

    container.innerHTML = html || "<p>No surveys available</p>"
  } catch (error) {
    console.error("Error loading department surveys:", error)
    document.getElementById("department-surveys").innerHTML = "<p>Error loading surveys</p>"
  }
}

// Delete Survey
window.deleteSurvey = async (surveyId) => {
  if (!confirm("Are you sure you want to delete this survey?")) {
    return
  }

  try {
    const response = await fetch(`/api/surveys/${surveyId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (response.ok) {
      // Remove the survey card from the UI
      const surveyCard = document.querySelector(`.survey-card[data-survey-id="${surveyId}"]`)
      if (surveyCard) {
        surveyCard.remove()
      }

      // Refresh the surveys display
      await loadDepartmentSurveys()
      await displayActiveSurveys()
    } else {
      const data = await response.json()
      alert(data.error || "Failed to delete survey")
    }
  } catch (error) {
    console.error("Delete error:", error)
    alert("Error deleting survey: " + error.message)
  }
}

// Create Survey
window.createSurvey = async () => {
  const isAllDepartments = document.getElementById("all-departments-checkbox")?.checked
  const department = isAllDepartments ? "all" : document.getElementById("department").value
  const title = document.getElementById("survey-title").value

  if (!title) {
    alert("Please enter a survey title")
    return
  }

  const questions = []
  let isValid = true

  document.querySelectorAll(".question-input").forEach((questionDiv) => {
    const questionText = questionDiv.querySelector(".question").value
    const questionType = questionDiv.querySelector(".question-type").value

    if (!questionText) {
      alert("Please fill in all questions")
      isValid = false
      return
    }

    const question = {
      text: questionText,
      type: questionType,
    }

    // Only validate options for radio and checkbox questions
    if (questionType === "radio" || questionType === "checkbox") {
      const optionInputs = questionDiv.querySelectorAll(".options-input")
      const options = []

      optionInputs.forEach((input) => {
        if (input.value.trim()) {
          options.push(input.value.trim())
        }
      })

      if (options.length < 2) {
        alert("Please provide at least 2 options for multiple choice/checkbox questions")
        isValid = false
        return
      }
      question.options = options
    }

    questions.push(question)
  })

  if (!isValid || questions.length === 0) return

  try {
    const response = await fetch("/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department,
        title,
        questions,
        isAllDepartments,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to create survey")
    }

    alert(isAllDepartments ? "Survey created successfully for all departments!" : "Survey created successfully!")

    // Only try to display active surveys if the element exists
    if (document.getElementById("active-surveys")) {
      await displayActiveSurveys()
    }
    await loadDepartmentSurveys()
    clearSurveyForm()
  } catch (error) {
    console.error("Survey creation error:", error)
    alert("Error creating survey: " + error.message)
  }
}

// Display Active Surveys
async function displayActiveSurveys() {
  try {
    const response = await fetch("/api/surveys/active")
    const surveys = await response.json()

    const container = document.getElementById("active-surveys")
    // Check if container exists before setting innerHTML
    if (!container) {
      console.warn("active-surveys container not found")
      return
    }

    container.innerHTML = surveys
      .map(
        (survey) => `
            <div class="survey-card">
                <h4>${survey.title}</h4>
                <p>Department: ${survey.department}</p>
                <p>Created: ${new Date(survey.createdAt).toLocaleDateString()}</p>
            </div>
        `,
      )
      .join("")
  } catch (error) {
    console.error("Error loading active surveys:", error)
  }
}

// Display Available Surveys
// Update the displayAvailableSurveys function to handle missing user data
async function displayAvailableSurveys() {
  try {
    // Make sure currentUser is available
    if (!currentUser) {
      currentUser = JSON.parse(localStorage.getItem("user"))
      if (!currentUser) {
        console.error("No user data found")
        return // Just return without trying to access user properties
      }
    }

    const container = document.getElementById("available-surveys")
    if (!container) {
      console.warn("available-surveys container not found")
      return
    }

    // First get the submitted surveys by the current user
    const submittedResponse = await fetch(`/api/responses/user/${currentUser.username}`)
    const submittedSurveys = await submittedResponse.json()

    // Create a Set of submitted survey IDs for easy lookup
    const submittedSurveyIds = new Set(submittedSurveys.map((response) => response.surveyId))

    // Get available surveys for the user's department
    const response = await fetch(`/api/surveys/${currentUser.department}`)
    const surveys = await response.json()

    // Filter out surveys that have already been submitted
    const availableSurveys = surveys.filter((survey) => !submittedSurveyIds.has(survey._id))

    if (availableSurveys.length === 0) {
      container.innerHTML = `
                <div class="no-surveys-message">
                    <p>No new surveys available at this time.</p>
                </div>
            `
      return
    }

    container.innerHTML = availableSurveys
      .map(
        (survey) => `
                <div class="survey-card">
                    <h4 class="center-title">${survey.title}</h4>
                    <form onsubmit="submitSurvey(event, '${survey._id}')">
                        ${survey.questions
                          .map(
                            (question, index) => `
                                <div class="survey-response">
                                    <p>${question.text}</p>
                                    ${generateQuestionInput(question, index)}
                                </div>
                            `,
                          )
                          .join("")}
                            <div class="center-submit">
                                <button type="submit">Submit Survey</button>
                            </div>
                    </form>
                </div>
            `,
      )
      .join("")
  } catch (error) {
    console.error("Error loading available surveys:", error)
    const container = document.getElementById("available-surveys")
    if (container) {
      container.innerHTML = "<p>Error loading surveys. Please try again later.</p>"
    }
  }
}

// Submit Survey Response
window.submitSurvey = async (event, surveyId) => {
  event.preventDefault()
  const form = event.target
  const formData = new FormData(form)
  const answers = new Map()

  // Collect all answers from the form
  for (const [name, value] of formData.entries()) {
    const questionIndex = name.replace("q", "")
    if (name.startsWith("q")) {
      answers.set(name, value)
    }
  }

  // Handle checkbox inputs separately
  form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const name = checkbox.name
    if (!answers.has(name)) {
      answers.set(name, [])
    }
    if (checkbox.checked) {
      const currentValue = answers.get(name)
      if (Array.isArray(currentValue)) {
        currentValue.push(checkbox.value)
      } else {
        answers.set(name, [checkbox.value])
      }
    }
  })

  // Convert answers Map to regular object
  const answersObject = {}
  answers.forEach((value, key) => {
    answersObject[key] = Array.isArray(value) ? value.join(", ") : value
  })

  try {
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surveyId,
        userId: currentUser.username,
        department: currentUser.department,
        answers: answersObject,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      const surveyCard = form.closest(".survey-card")
      // Clear the form content first
      surveyCard.innerHTML = ""

      // Create and append success message
      const successDiv = document.createElement("div")
      successDiv.className = "success-message"
      successDiv.setAttribute("role", "alert")
      successDiv.innerHTML = `
                <h4><i class="fas fa-check-circle"></i> Survey Submitted Successfully!</h4>
                <p>Thank you for your response.</p>
            `
      surveyCard.appendChild(successDiv)

      // Wait and then refresh surveys
      setTimeout(async () => {
        await displayAvailableSurveys()
      }, 2000)
    } else {
      throw new Error(data.error || "Failed to submit survey")
    }
  } catch (error) {
    console.error("Survey submission error:", error)
    alert("Error submitting survey: " + error.message)
  }
}
// Export Responses
window.exportResponses = async () => {
  try {
    const response = await fetch("/api/responses/export")
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "survey_responses.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    alert("Error exporting responses: " + error.message)
  }
}

window.generateAnalysis = async () => {
  try {
    const response = await fetch("/api/responses/analysis")
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "survey_analysis.pdf"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    alert("Error generating analysis: " + error.message)
  }
}

// Update the logout function to properly clear session data
function logout() {
  try {
    // Clear all stored data
    localStorage.removeItem("user")
    sessionStorage.clear()
    currentUser = null
    clearSession()

    // Hide all panels
    document.getElementById("admin-panel").classList.add("hidden")
    document.getElementById("employee-panel").classList.add("hidden")
    document.getElementById("signup-container").classList.add("hidden")
    document.getElementById("forgot-password-container")?.classList.add("hidden")
    document.getElementById("reset-verification-container")?.classList.add("hidden")
    document.getElementById("verification-container")?.classList.add("hidden")
    document.getElementById("navbar-logout").classList.add("hidden")

    // Show login container
    document.getElementById("login-container").classList.remove("hidden")

    // Clear all input fields
    document.getElementById("username").value = ""
    document.getElementById("password").value = ""
    document.getElementById("new-username").value = ""
    document.getElementById("new-password").value = ""

    // Clear any survey forms if they exist
    const surveyTitle = document.getElementById("survey-title")
    if (surveyTitle) surveyTitle.value = ""

    const questionsContainer = document.getElementById("questions-container")
    if (questionsContainer) {
      questionsContainer.innerHTML = ""
      addQuestion() // Add a default question
    }

    // Send logout request to server to invalidate session
    fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    }).catch((err) => {
      console.error("Logout request error:", err)
      // Continue with client-side logout even if server request fails
    })
  } catch (error) {
    console.error("Error during logout:", error)
    // Fallback logout mechanism
    localStorage.removeItem("user")
    sessionStorage.clear()
    window.location.reload()
  }
}

// Helper Functions
function generateQuestionInput(question, index) {
  switch (question.type) {
    case "text":
      return `
        <div class="form__group_one">
          <input type="text" class="form__group_oneform__field" name="q${index}" placeholder="Enter your response" required autocomplete="off">
          <label class="form__group_oneform__label">Enter your response</label>
        </div>
      `
    case "radio":
      return `
                <div class="radio-inputs">
                    ${question.options
                      .map(
                        (option) => `
                        <label class="radio">
                            <input type="radio" name="q${index}" value="${option}" required>
                            <span class="name">${option}</span>
                        </label>
                    `,
                      )
                      .join("")}
                </div>
            `
    case "checkbox":
      return `
        <div class="checkbox-inputs">
          ${question.options.map(option => `
            <label class="checkbox">
              <input type="checkbox" name="q${index}" value="${option}">
              <span class="name">${option}</span>
            </label>
          `).join('')}
        </div>
      `
    case "star":
      return `
                <div class="star-rating">
                    ${[5, 4, 3, 2, 1]
                      .map(
                        (star) => `
                        <div class="star-option">
                            <label>
                                <input type="radio" name="q${index}" value="${star}" required>
                                <span class="star-label">${"★".repeat(star)}</span>
                            </label>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            `
  }
}

function clearSurveyForm() {
  document.getElementById("survey-title").value = ""
  document.getElementById("questions-container").innerHTML = ""
  addQuestion()
}

function addAllDepartmentsOption() {
  const surveyForm = document.querySelector("#create-survey-form")
  const departmentSelect = document.getElementById("department")

  // Create the checkbox container
  const checkboxContainer = document.createElement("div")
  checkboxContainer.className = "all-departments-option"
  checkboxContainer.innerHTML = `
        <label>
            <input type="checkbox" id="all-departments-checkbox" onchange="handleAllDepartments(this)">
            Apply to all departments
        </label>
    `

  // Insert after department select
  departmentSelect.parentNode.insertBefore(checkboxContainer, departmentSelect.nextSibling)
}

function handleAllDepartments(checkbox) {
  const departmentSelect = document.getElementById("department")
  departmentSelect.disabled = checkbox.checked
  if (checkbox.checked) {
    departmentSelect.value = "all"
  }
}

// Add event listeners for page visibility changes to maintain session
document.addEventListener("DOMContentLoaded", () => {
  loadDepartments()
  addQuestion()
  addAllDepartmentsOption()

  // Check login state when page loads
  checkLoginState()

  // Add visibility change listener to handle tab switching/reopening
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // When tab becomes visible again, check login state
      checkLoginState()
    }
  })

  // Update the login form HTML
  document.getElementById("login-container").querySelector(".login-form").innerHTML = `
    <input type="text" id="username" placeholder="Username" autocomplete="off" />
    <input type="password" id="password" placeholder="Password" autocomplete="off" />
    <button onclick="login()">Login</button>
    <div class="form-footer">
        <p>Don't have an account? <button onclick="showSignup()" class="link-button">Sign Up</button></p>
        <button onclick="showForgotPassword()" class="link-button">Forgot Password?</button>
    </div>
  `

  // Update the signup form HTML to include the employee ID field and tenure dropdown
  document.getElementById("signup-container").querySelector(".signup-form").innerHTML = `
    <input type="text" id="new-username" placeholder="Username" autocomplete="off" />
    <input type="email" id="new-email" placeholder="Email" required autocomplete="off" />
    <input type="text" id="new-employee-id" placeholder="Employee ID" required autocomplete="off" />
    <input type="password" id="new-password" placeholder="Password" autocomplete="off" />
    <select id="new-department" autocomplete="off">
        <option value="" disabled selected>Select Department</option>
        ${DEPARTMENTS.map(dept => `<option value="${dept.value}">${dept.label}</option>`).join('')}
    </select>
    <select id="new-tenure" required autocomplete="off">
        <option value="" disabled selected>Select Tenure</option>
        <option value="0-6 months">0-6 months</option>
        <option value="up to 1 year">up to 1 year</option>
        <option value="Less than 5 years">Less than 5 years</option>
        <option value="more than 5 years">more than 5 years</option>
    </select>
    <button onclick="signup()">Sign Up</button>
    <div class="login-prompt">
        <span>Already have an account?</span>
        <button onclick="showLogin()" class="link-button">Login</button>
    </div>
    <p class="form-footer"></p>
  `
  // Add the active-surveys container to the admin panel if it doesn't exist
  const adminPanel = document.getElementById("admin-panel")
  if (adminPanel && !document.getElementById("active-surveys")) {
    const surveysListDiv = adminPanel.querySelector(".surveys-list")
    if (surveysListDiv) {
      const activeSurveysDiv = document.createElement("div")
      activeSurveysDiv.id = "active-surveys"
      // activeSurveysDiv.innerHTML = "<h3>Active Surveys</h3>"
      surveysListDiv.appendChild(activeSurveysDiv)
    }
  }
})

// Update the existing mousemove event listener
document.addEventListener('DOMContentLoaded', function() {
    document.body.addEventListener('mousemove', function(e) {
        // Handle radio buttons
        const radioLabels = document.querySelectorAll('.radio .name');
        radioLabels.forEach(label => {
            const rect = label.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / label.offsetWidth) * 100;
            const y = ((e.clientY - rect.top) / label.offsetHeight) * 100;
            label.style.setProperty('--x', `${x}%`);
            label.style.setProperty('--y', `${y}%`);
        });

        // Handle checkboxes with the same effect
        const checkboxLabels = document.querySelectorAll('.checkbox .name');
        checkboxLabels.forEach(label => {
            const rect = label.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / label.offsetWidth) * 100;
            const y = ((e.clientY - rect.top) / label.offsetHeight) * 100;
            label.style.setProperty('--x', `${x}%`);
            label.style.setProperty('--y', `${y}%`);
        });
    });
});

const DEPARTMENTS = [
  { value: "IT", label: "IT Department" },
  { value: "HR", label: "HR Department" },
  { value: "Finance", label: "Finance Department" },
  { value: "Marketing", label: "Marketing Department" },
  { value: "Learning and Training", label: "Learning and Training" },
  { value: "Franchise", label: "Franchise" },
  { value: "Sales", label: "Sales" },
  { value: "Support", label: "Support" },
  { value: "Product Development", label: "Product Development" },
]

// Then modify the loadDepartments function
async function loadDepartments() {
  try {
    const departmentSelects = ["new-department", "department"] // Both signup and admin panel selects

    departmentSelects.forEach((selectId) => {
      const select = document.getElementById(selectId)
      if (select) {
        // Clear existing options
        select.innerHTML = ""

        // Add default option
        const defaultOption = document.createElement("option")
        defaultOption.value = ""
        defaultOption.textContent = "Select Department"
        defaultOption.disabled = true
        defaultOption.selected = true
        select.appendChild(defaultOption)

        // Add departments from the constant
        DEPARTMENTS.forEach((dept) => {
          const option = document.createElement("option")
          option.value = dept.value
          option.textContent = dept.label
          select.appendChild(option)
        })
      }
    })
  } catch (error) {
    console.error("Error loading departments:", error)
  }
}

// Show forgot password form
window.showForgotPassword = () => {
  document.getElementById("login-container").classList.add("hidden")
  document.getElementById("forgot-password-container").classList.remove("hidden")
}

// Request password reset
window.requestPasswordReset = async () => {
  const email = document.getElementById("reset-email").value.trim()

  if (!email || !validateEmail(email)) {
    alert("Please enter a valid email address")
    return
  }

  try {
    const response = await fetch("/api/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (data.success) {
      // Store email for reset verification
      sessionStorage.setItem("resetEmail", email)

      // Show reset verification form
      document.getElementById("forgot-password-container").classList.add("hidden")
      document.getElementById("reset-verification-container").classList.remove("hidden")
      alert("Please check your email for the reset code")
    } else {
      alert(data.error || "Failed to request password reset")
    }
  } catch (error) {
    console.error("Password reset request error:", error)
    alert("Error requesting password reset: " + error.message)
  }
}

// Verify reset code and set new password
window.verifyAndResetPassword = async () => {
  const email = sessionStorage.getItem("resetEmail")
  const resetCode = document.getElementById("reset-code").value.trim()
  const newPassword = document.getElementById("new-reset-password").value

  if (!email) {
    alert("Please request a new reset code")
    showForgotPassword()
    return
  }

  if (!resetCode) {
    alert("Please enter the reset code")
    return
  }

  if (!validatePassword(newPassword)) {
    alert(
      "Password must be at least 8 characters long and contain uppercase, lowercase, numbers and special characters",
    )
    return
  }

  try {
    const response = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        resetCode,
        newPassword,
      }),
    })

    const data = await response.json()

    if (data.success) {
      alert("Password reset successful! Please login with your new password.")
      sessionStorage.removeItem("resetEmail")
      document.getElementById("reset-verification-container").classList.add("hidden")
      showLogin()
    } else {
      alert(data.error || "Failed to reset password")
    }
  } catch (error) {
    console.error("Password reset error:", error)
    alert("Error resetting password: " + error.message)
  }
}

// Add this function after displayAvailableSurveys
// Also update the loadAvailableSurveys function to handle missing user data
async function loadAvailableSurveys() {
  try {
    // Make sure currentUser is available
    if (!currentUser) {
      currentUser = JSON.parse(localStorage.getItem("user"))
      if (!currentUser) {
        console.error("No user data found")
        return // Just return without trying to access user properties
      }
    }

    await displayAvailableSurveys()
  } catch (error) {
    console.error("Error loading available surveys:", error)
    const container = document.getElementById("available-surveys")
    if (container) {
      container.innerHTML = "<p>Error loading surveys. Please try again later.</p>"
    }
  }
}
