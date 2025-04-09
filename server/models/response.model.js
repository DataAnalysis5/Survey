import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
    surveyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Survey',
        required: [true, 'Survey ID is required']
    },
    userId: {
        type: String,
        required: [true, 'User ID is required'],
        trim: true
    },
    department: {
        type: String,
        required: [true, 'Department is required'],
        trim: true
    },
    answers: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        required: [true, 'Answers are required'],
        validate: {
            validator: async function(answers) {
                const survey = await mongoose.model('Survey').findById(this.surveyId);
                if (!survey) return false;

                for (let i = 0; i < survey.questions.length; i++) {
                    const question = survey.questions[i];
                    const answer = answers.get(`q${i}`);

                    if (!answer && question.type !== 'checkbox') {
                        return false;
                    }

                    switch (question.type) {
                        case 'radio':
                            if (!question.options.includes(answer)) {
                                return false;
                            }
                            break;
                        case 'star':
                            const rating = parseInt(answer);
                            if (isNaN(rating) || rating < 1 || rating > 5) {
                                return false;
                            }
                            break;
                        case 'checkbox':
                            if (answer) {
                                const selectedOptions = answer.split(', ');
                                if (!selectedOptions.every(opt => question.options.includes(opt))) {
                                    return false;
                                }
                            }
                            break;
                        case 'text':
                            if (typeof answer !== 'string' || answer.trim().length === 0) {
                                return false;
                            }
                            break;
                    }
                }
                return true;
            },
            message: 'Invalid response format'
        }
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    pdfGenerated: {
        type: Boolean,
        default: false
    },
    pdfPath: {
        type: String,
        default: null
    }
});

// Add index for better query performance
responseSchema.index({ surveyId: 1, userId: 1 });

export default mongoose.model('Response', responseSchema);