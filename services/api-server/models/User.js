import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profile: {
        age: Number,
        gender: String,
        weightKg: Number
    },
    goals: {
        stepGoal: { type: Number, default: 10000 },
        sleepGoalHours: { type: Number, default: 8 }, // Basis for "Sleep Debt"
        activeEnergyGoal: { type: Number, default: 500 }
    },
    uploadToken: { type: String, default: null, index: true },
    processingPhase: { type: String, default: null },
    processingStartedAt: { type: Date, default: null },
    processingError: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model('User', userSchema);