import mongoose from 'mongoose';
import HealthRecord from '../models/HealthRecord.js';
import { getProcessingState } from './uploadController.js';

const TYPE_MAP = {
    HKQuantityTypeIdentifierStepCount: 'steps',
    HKCategoryTypeIdentifierSleepAnalysis: 'sleep_hours',
    HKQuantityTypeIdentifierActiveEnergyBurned: 'active_energy',
};

/** GET /api/health/processing — returns current upload processing phase */
export const getProcessingStatus = async (req, res) => {
    try {
        const state = await getProcessingState(req.user._id);
        res.json({ phase: state?.phase ?? 'idle', startedAt: state?.startedAt ?? null });
    } catch {
        res.json({ phase: 'idle', startedAt: null });
    }
};

/** GET /api/health/status — boolean for the DataGate */
export const getDataStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const count = await HealthRecord.countDocuments({ userId });

        let lastUpload = null;
        if (count > 0) {
            const latest = await HealthRecord.findOne({ userId })
                .sort({ endDate: -1 })
                .select('endDate');
            lastUpload = latest?.endDate ?? null;
        }
        res.json({ hasData: count > 0, recordCount: count, lastUpload });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /api/health/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Aggregates raw HealthRecord docs into per-day summaries.
 */
export const getDailyData = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user._id);
        const { from, to } = req.query;

        const match = {
            userId,
            type: { $in: Object.keys(TYPE_MAP) },
        };
        if (from || to) {
            match.startDate = {};
            if (from) match.startDate.$gte = new Date(from);
            if (to) match.startDate.$lte = new Date(to);
        }

        const rows = await HealthRecord.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$startDate' } },
                        type: '$type',
                    },
                    total: { $sum: '$value' },
                },
            },
            {
                $group: {
                    _id: '$_id.date',
                    items: { $push: { type: '$_id.type', total: '$total' } },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const daily = rows.map((row) => {
            const day = { date: row._id, steps: 0, sleep_hours: 0, active_energy: 0 };
            row.items.forEach(({ type, total }) => {
                const key = TYPE_MAP[type];
                if (key) day[key] = Math.round(total * 100) / 100;
            });
            return day;
        });

        res.json({ daily, count: daily.length });
    } catch (error) {
        console.error('Daily data error:', error);
        res.status(500).json({ error: error.message });
    }
};