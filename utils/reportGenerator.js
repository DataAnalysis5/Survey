import fs from 'fs';
import PDFDocument from 'pdfkit';
import csv from 'csv-parser';
import Chart from 'chart.js/auto';
import { createCanvas } from 'canvas';
import path from 'path'; 

class ReportGenerator {
    constructor(csvPath) {
        this.csvPath = csvPath;
        this.data = [];
        this.d3 = null;
    }

    async readCSV() {
        // Check if file exists first
        if (!fs.existsSync(this.csvPath)) {
            throw new Error(`CSV file not found at path: ${this.csvPath}`);
        }
    
        return new Promise((resolve, reject) => {
            const results = [];
            fs.createReadStream(this.csvPath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => {
                    if (results.length === 0) {
                        reject(new Error('CSV file is empty'));
                    } else {
                        resolve(results);
                    }
                })
                .on('error', (error) => reject(error));
        });
    }
    generateOverview(data) {
        try {
            // Calculate total responses
            const totalResponses = data.length;

            // Get unique departments
            const departments = new Set(data.map(row => row['Department'])).size;

            // Calculate average satisfaction rate
            let satisfactionCount = 0;
            let totalSatisfactionResponses = 0;

            data.forEach(row => {
                // Look for satisfaction-related questions
                Object.keys(row).forEach(key => {
                    if (key.startsWith('Answer')) {
                        const answer = row[key].toLowerCase();
                        if (this.isSatisfactionQuestion(row[`Question ${key.split(' ')[1]}`])) {
                            totalSatisfactionResponses++;
                            if (this.isPositiveSatisfactionResponse(answer)) {
                                satisfactionCount++;
                            }
                        }
                    }
                });
            });

            const averageSatisfactionRate = totalSatisfactionResponses > 0
                ? (satisfactionCount / totalSatisfactionResponses) * 100
                : 0;

            return {
                totalResponses,
                departments,
                averageSatisfactionRate
            };
        } catch (error) {
            console.error('Error generating overview:', error);
            return {
                totalResponses: 0,
                departments: 0,
                averageSatisfactionRate: 0
            };
        }
    }
    isSatisfactionQuestion(question) {
        if (!question) return false;
        const questionLower = question.toLowerCase();
        return questionLower.includes('satisf') || 
               questionLower.includes('happy') || 
               questionLower.includes('content');
    }
    isPositiveSatisfactionResponse(answer) {
        const positiveResponses = [
            'very satisfied',
            'satisfied',
            'very happy',
            'happy',
            'excellent',
            'good'
        ];
        return positiveResponses.some(response => 
            answer.includes(response) && 
            !answer.includes('not') && 
            !answer.includes('dis')
        );
    }



    async initialize() {
        try {
            this.d3 = await import('d3-array');
        } catch (error) {
            console.error('Error loading d3-array:', error);
            throw error;
        }
    }

    async analyze() {
        try {
            const responses = await this.loadResponses();
            const satisfactionRate = this.calculateSatisfactionRate(responses);
            
            // Group responses by department
            const departmentResponses = {};
            responses.forEach(response => {
                const dept = response.department || 'Unknown';
                if (!departmentResponses[dept]) {
                    departmentResponses[dept] = [];
                }
                departmentResponses[dept].push(response);
            });

            // Calculate department-wise stats
            const departmentStats = Object.entries(departmentResponses).map(([dept, deptResponses]) => {
                const deptSatisfactionRate = this.calculateSatisfactionRate(deptResponses);
                return `${dept}: ${deptSatisfactionRate}% Satisfaction (${deptResponses.length} responses)`;
            }).join('\n');

            return {
                totalResponses: responses.length,
                satisfactionRate,
                departmentStats,
                departmentResponses
            };
        } catch (error) {
            console.error('Analysis error:', error);
            throw error;
        }
    }

    // Update the generateAnalysis method
    async generateAnalysis() {
        try {
            const responses = await this.readCSV();
            const departments = [...new Set(responses.map(r => r['Department']))];
            const satisfactionMetrics = this.calculateSatisfactionPercentage(responses);
            
            const analysis = {
                overview: {
                    totalResponses: responses.length,
                    numberOfDepartments: departments.length,
                    averageSatisfaction: `${satisfactionMetrics.satisfaction}%`,
                    averageDissatisfaction: `${satisfactionMetrics.dissatisfaction}%`
                },
                departmentStats: {}
            };

            // Process department-wise statistics
            departments.forEach(dept => {
                const deptResponses = responses.filter(r => r['Department'] === dept);
                
                // Analyze questions for this department
                const questionAnalysis = {};
                deptResponses.forEach(response => {
                    Object.keys(response).forEach(key => {
                        if (key.startsWith('Question')) {
                            const qNum = key.split(' ')[1];
                            const answerKey = `Answer ${qNum}`;
                            const question = response[key];
                            const answer = response[answerKey];

                            if (!questionAnalysis[qNum]) {
                                questionAnalysis[qNum] = {
                                    question: question,
                                    responses: {},
                                    responseCount: 0,
                                    type: this.determineQuestionType(answer)
                                };
                            }

                            // Handle different types of questions
                            if (this.isStarRatingQuestion(question, [answer])) {
                                questionAnalysis[qNum].type = 'StarRating';
                                questionAnalysis[qNum].responses = {
                                    ...(questionAnalysis[qNum].responses),
                                    [answer]: (questionAnalysis[qNum].responses[answer] || 0) + 1
                                };
                            } else if (answer.includes(',')) {
                                // Handle checkbox questions
                                const options = answer.split(',').map(opt => opt.trim());
                                options.forEach(opt => {
                                    questionAnalysis[qNum].responses[opt] = (questionAnalysis[qNum].responses[opt] || 0) + 1;
                                });
                                questionAnalysis[qNum].type = 'Checkbox';
                            } else {
                                // Handle MCQ and text questions
                                questionAnalysis[qNum].responses[answer] = (questionAnalysis[qNum].responses[answer] || 0) + 1;
                                if (!questionAnalysis[qNum].type) {
                                    questionAnalysis[qNum].type = this.isMCQQuestion([answer]) ? 'MCQ' : 'Text';
                                }
                            }
                            questionAnalysis[qNum].responseCount++;
                        }
                    });
                });

                analysis.departmentStats[dept] = {
                    totalResponses: deptResponses.length,
                    questionAnalysis: questionAnalysis
                };
            });

            return analysis;
        } catch (error) {
            console.error('Analysis generation error:', error);
            throw error;
        }
    }

    isMCQQuestion(answers) {
        const commonOptions = ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'];
        return answers.every(answer => 
            commonOptions.includes(answer) || answer === 'No answer'
        );
    }
    isCheckboxQuestion(answers) {
        return answers.some(answer => answer.includes(','));
    }

    // Add this new method to identify star rating questions
    isStarRatingQuestion(question, answers) {
        if (!question || !answers) return false;
        
        // Check if answers match the star rating pattern
        const starPattern = /^\d+\s*stars?$/i;
        const hasStarFormat = answers.some(answer => 
            answer && starPattern.test(answer.trim())
        );
        
        return hasStarFormat;
    }

    // Replace the existing calculateAverageStarRating method
    calculateAverageStarRating(responses) {
        const validResponses = responses.filter(response => {
            if (!response || typeof response !== 'string') return false;
            const numberMatch = response.match(/(\d+)\s*stars?/i);
            return numberMatch !== null;
        });

        if (validResponses.length === 0) return '0.0';

        const sum = validResponses.reduce((total, response) => {
            const numberMatch = response.match(/(\d+)\s*stars?/i);
            const stars = parseInt(numberMatch[1]);
            return isNaN(stars) ? total : total + stars;
        }, 0);

        return (sum / validResponses.length).toFixed(1);
    }

    async generatePDF(analysis) {
        try {
            // Validate analysis object
            if (!analysis) {
                analysis = await this.generateAnalysis();
            }
    
            // Set default values
            const defaultAnalysis = {
                overview: {
                    totalResponses: 0,
                    departments: 0,
                    averageSatisfactionRate: 0
                },
                departmentStats: {},
                questionAnalysis: {}
            };
    
            // Merge with defaults
            analysis = {
                ...defaultAnalysis,
                ...analysis,
                overview: {
                    ...defaultAnalysis.overview,
                    ...(analysis?.overview || {})
                }
            };
    
            const doc = new PDFDocument();
            const outputPath = path.join(path.dirname(this.csvPath), '..', 'reports', 'survey_analysis.pdf');
            
            // Ensure reports directory exists
            const reportsDir = path.dirname(outputPath);
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
    
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);
    
            // Title
            doc.fontSize(24).text('Survey Analysis Report', { align: 'center' });
            doc.moveDown();
    
            // Overview section
            doc.fontSize(18).text('Overview');
            doc.fontSize(12)
                .text(`Total Responses: ${analysis.overview.totalResponses}`)
                .text(`Number of Departments: ${analysis.overview.numberOfDepartments}`)
                .text(`Average Satisfaction: ${analysis.overview.averageSatisfaction}`)
                .text(`Average Dissatisfaction: ${analysis.overview.averageDissatisfaction}`);
            doc.moveDown(2);
    
            // Department Statistics section - Keep the existing format
            Object.entries(analysis.departmentStats).forEach(([department, stats]) => {
                doc.fontSize(16).text(`Department: ${department}`);
                doc.fontSize(12).text(`Total Responses: ${stats.totalResponses}`);
                doc.moveDown();
            
                // Question Analysis
                Object.entries(stats.questionAnalysis).forEach(([qNum, qData]) => {
                    doc.fontSize(14).text(qData.question);
                    doc.fontSize(12);
            
                    if (qData.type === 'Text') {
                        doc.text('Text Responses:');
                        Object.entries(qData.responses).forEach(([response, count], index) => {
                            doc.text(`${index + 1}. ${response}`);
                        });
                    } else if (qData.type === 'MCQ') {
                        Object.entries(qData.responses).forEach(([option, count]) => {
                            const percentage = ((count / qData.responseCount) * 100).toFixed(1);
                            doc.text(`${option}: ${count} responses (${percentage}%)`);
                        });
                    } else if (qData.type === 'Checkbox') {
                        Object.entries(qData.responses).forEach(([option, count]) => {
                            const percentage = ((count / qData.responseCount) * 100).toFixed(1);
                            doc.text(`${option}: ${count} selections (${percentage}%)`);
                        });
                    } else if (qData.type === 'StarRating') {
                        for (let stars = 5; stars >= 1; stars--) {
                            const count = qData.responses[`${stars} stars`] || 0;
                            doc.text(`${stars} star (${count} selections)`);
                        }
                        // Calculate and display average rating
                        let totalStars = 0;
                        let totalResponses = 0;
                        Object.entries(qData.responses).forEach(([response, count]) => {
                            const stars = parseInt(response);
                            if (!isNaN(stars)) {
                                totalStars += stars * count;
                                totalResponses += count;
                            }
                        });
                        const averageRating = totalResponses > 0 ? (totalStars / totalResponses).toFixed(1) : '0.0';
                        doc.moveDown();
                        doc.text(`Average Star Rating: ${averageRating}`);
                    }
            
                    doc.text(`Total responses for this question: ${qData.responseCount}`);
                    doc.moveDown(2);
                });
            
                doc.text('----------------------------------------');
                doc.moveDown(2);
            });


            doc.addPage();
            

            doc.fontSize(18).text('Satisfaction Distribution', { align: 'center' });
            doc.moveDown();
            
            const satisfactionData = this.aggregateSatisfactionLevels(analysis);
            const chartCanvas = await this.createSatisfactionPieChart(satisfactionData);
            const chartBuffer = chartCanvas.toBuffer('image/png');
            
            doc.image(chartBuffer, {
                fit: [500, 300],
                align: 'center'
            });

            doc.end();
    
            return new Promise((resolve, reject) => {
                stream.on('finish', () => resolve(outputPath));
                stream.on('error', reject);
            });
        } catch (error) {
            console.error('PDF Generation Error:', error);
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }

    async generateCharts(analysis) {
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: analysis.departmentStats.map(d => d.department),
                datasets: [{
                    label: 'Satisfaction Rate by Department',
                    data: analysis.departmentStats.map(d => d.satisfactionRate),
                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        return canvas;
    }

    calculateSatisfactionRate(responses) {
        let totalResponses = 0;
        let satisfiedCount = 0;
        
        responses.forEach(response => {
            Object.values(response.answers).forEach(answer => {
                if (typeof answer === 'string') {
                    const lowerAnswer = answer.toLowerCase();
                    // Check for satisfaction-related responses
                    if (lowerAnswer.includes('satisf') || 
                        lowerAnswer.includes('happy') ||
                        lowerAnswer.includes('good')) {
                        
                        totalResponses++;
                        
                        // Count as satisfied only if positive response
                        if (!lowerAnswer.includes('not') && 
                            !lowerAnswer.includes('dis') && 
                            (lowerAnswer.includes('very satisf') || 
                             lowerAnswer.includes('quite satisf') ||
                             lowerAnswer.includes('very happy') ||
                             lowerAnswer.includes('very good'))) {
                            satisfiedCount++;
                        }
                    }
                }
            });
        });

        return totalResponses > 0 ? Math.round((satisfiedCount / totalResponses) * 100) : 0;
    }

    calculateOverallSatisfactionRate() {
        return this.calculateSatisfactionRate(this.data);
    }

    analyzeQuestions() {
        if (!this.d3) return {};

        const questions = {};
        this.data.forEach(response => {
            for (const [key, value] of Object.entries(response)) {
                if (key.startsWith('Question')) {
                    if (!questions[key]) {
                        questions[key] = {
                            text: value,
                            responses: []
                        };
                    }
                    const answerKey = `Answer ${key.split(' ')[1]}`;
                    questions[key].responses.push(response[answerKey]);
                }
            }
        });

        return questions;
    }

    async loadResponses() {
        return new Promise((resolve, reject) => {
            const responses = [];
            fs.createReadStream(this.csvPath)
                .pipe(csv())
                .on('data', (data) => {
                    // Transform CSV data into response format
                    const response = {
                        department: data.Department,
                        answers: {}
                    };

                    // Extract questions and answers
                    Object.keys(data).forEach(key => {
                        if (key.startsWith('Question')) {
                            const questionNumber = key.split(' ')[1];
                            const answerKey = `Answer ${questionNumber}`;
                            response.answers[`q${questionNumber}`] = data[answerKey];
                        }
                    });

                    responses.push(response);
                })
                .on('end', () => {
                    this.data = responses; // Store the data for other methods to use
                    resolve(responses);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    calculateSatisfactionPercentage(responses) {
        let satisfactionScore = 0;
        let dissatisfactionScore = 0;
        let satisfactionQuestions = 0;
        let dissatisfactionQuestions = 0;

        responses.forEach(response => {
            Object.keys(response).forEach(key => {
                if (key.startsWith('Answer')) {
                    const answer = response[key];
                    const questionKey = `Question ${key.split(' ')[1]}`;
                    const question = response[questionKey];

                    if (!answer || !question) return;

                    // Handle star ratings
                    const starMatch = answer.match(/(\d+)\s*stars?/i);
                    if (starMatch) {
                        const stars = parseInt(starMatch[1]);
                        if (!isNaN(stars)) {
                            if (stars >= 3) {
                                satisfactionScore += (stars / 5) * 100;
                                satisfactionQuestions++;
                            } else {
                                dissatisfactionScore += ((5 - stars) / 5) * 100;
                                dissatisfactionQuestions++;
                            }
                        }
                    }
                    // Handle satisfaction-based responses
                    else {
                        const satisfactionLevels = {
                            'Very Satisfied': 100,
                            'Satisfied': 75,
                            'Neutral': 50,
                            'Dissatisfied': 25,
                            'Very Dissatisfied': 0
                        };

                        const answerKey = answer.trim();
                        if (satisfactionLevels.hasOwnProperty(answerKey)) {
                            if (['Very Satisfied', 'Satisfied'].includes(answerKey)) {
                                satisfactionScore += satisfactionLevels[answerKey];
                                satisfactionQuestions++;
                            } else if (['Dissatisfied', 'Very Dissatisfied'].includes(answerKey)) {
                                dissatisfactionScore += (100 - satisfactionLevels[answerKey]);
                                dissatisfactionQuestions++;
                            }
                        }
                    }
                }
            });
        });

        return {
            satisfaction: satisfactionQuestions > 0 ? Math.round(satisfactionScore / satisfactionQuestions) : 0,
            dissatisfaction: dissatisfactionQuestions > 0 ? Math.round(dissatisfactionScore / dissatisfactionQuestions) : 0
        };
    }
    
    // Add this helper method
    determineQuestionType(answer) {
        if (answer.match(/(\d+)\s*stars?/i)) return 'StarRating';
        if (answer.includes(',')) return 'Checkbox';
        if (['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied'].includes(answer)) return 'MCQ';
        return 'Text';
    }

    // Add this method after calculateSatisfactionPercentage
    aggregateSatisfactionLevels(analysis) {
        const satisfactionCounts = {
            'Very Satisfied': 0,
            'Satisfied': 0,
            'Neutral': 0,
            'Dissatisfied': 0,
            'Very Dissatisfied': 0
        };

        Object.values(analysis.departmentStats).forEach(deptData => {
            Object.values(deptData.questionAnalysis).forEach(qData => {
                if (qData.type === 'MCQ') {
                    Object.entries(qData.responses).forEach(([response, count]) => {
                        if (satisfactionCounts.hasOwnProperty(response)) {
                            satisfactionCounts[response] += count;
                        }
                    });
                }
            });
        });

        return satisfactionCounts;
    }

    // Add this method after aggregateSatisfactionLevels
    async createSatisfactionPieChart(satisfactionData) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');

        // Calculate total responses for percentage
        const total = Object.values(satisfactionData).reduce((a, b) => a + b, 0);

        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                // Create labels with counts and percentages
                labels: Object.entries(satisfactionData).map(([key, value]) => {
                    const percentage = ((value / total) * 100).toFixed(1);
                    return `${key}: ${value} (${percentage}%)`;
                }),
                datasets: [{
                    data: Object.values(satisfactionData),
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.8)',  // Very Satisfied - Teal
                        'rgba(54, 162, 235, 0.8)',  // Satisfied - Blue
                        'rgba(255, 206, 86, 0.8)',  // Neutral - Yellow
                        'rgba(255, 159, 64, 0.8)',  // Dissatisfied - Orange
                        'rgba(255, 99, 132, 0.8)'   // Very Dissatisfied - Red
                    ],
                    borderColor: '#ffffff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'black',
                            font: {
                                size: 12
                            },
                            // Ensure labels don't get cut off
                            padding: 20
                        }
                    },
                    title: {
                        display: true,
                        text: 'Overall Satisfaction Distribution',
                        color: 'black',
                        font: {
                            size: 16
                        },
                        padding: 20
                    },
                    // Add tooltips configuration
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${context.label}: ${value} responses (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        return canvas;
    }
}

export default ReportGenerator;