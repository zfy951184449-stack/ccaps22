import { Request, Response } from 'express';
import {
    createOrganizationUnit,
    updateOrganizationUnit,
    deleteOrganizationUnit,
    CreateUnitDTO,
    UpdateUnitDTO
} from '../services/organizationUnitsService';

export const createUnit = async (req: Request, res: Response) => {
    try {
        const data: CreateUnitDTO = req.body;
        if (!data.unit_name || !data.unit_type) {
            return res.status(400).json({ message: 'unit_name and unit_type are required' });
        }
        const bucket = await createOrganizationUnit(data);
        res.status(201).json(bucket);
    } catch (err) {
        console.error('Error creating unit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateUnit = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const data: UpdateUnitDTO = req.body;
        await updateOrganizationUnit(id, data);
        res.json({ message: 'Unit updated successfully' });
    } catch (err) {
        console.error('Error updating unit:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteUnit = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        await deleteOrganizationUnit(id);
        res.json({ message: 'Unit deleted successfully' });
    } catch (err: any) {
        console.error('Error deleting unit:', err);
        if (err.message.includes('Cannot delete')) {
            return res.status(409).json({ message: err.message });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};
