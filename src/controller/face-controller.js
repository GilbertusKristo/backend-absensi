import fs from 'fs';
import path from 'path';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import canvas from 'canvas';
import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODEL_PATH = path.join(process.cwd(), 'models');
await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH),
]);

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

export const registerFace = async (req, res, next) => {
    try {
        const username = req.user?.username;

        if (!req.file) throw new ResponseError(400, 'File tidak ditemukan');
        if (!username) throw new ResponseError(401, 'Unauthorized');

        const user = await prismaClient.user.findUnique({ where: { username } });
        if (!user) throw new ResponseError(404, "User tidak ditemukan");

        const image = await canvas.loadImage(req.file.path);

        const detection = await faceapi
            .detectSingleFace(image, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) throw new ResponseError(400, "Wajah tidak terdeteksi");

        const descriptor = Array.from(detection.descriptor);

        const updatedUser = await prismaClient.user.update({
            where: { username },
            data: { descriptor },
            select: { username: true, name: true },
        });

        // Hapus file setelah selesai
        fs.unlinkSync(req.file.path);

        res.status(201).json({
            message: "Face data berhasil diregistrasi",
            data: updatedUser,
        });
    } catch (e) {
        next(e);
    }
};

export const matchFace = async (req, res, next) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Latitude dan longitude harus dikirim dan berbentuk angka' });
        }

        if (!req.file) throw new ResponseError(400, 'File tidak ditemukan');

        const image = await canvas.loadImage(req.file.path);

        const detection = await faceapi
            .detectSingleFace(image, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) throw new ResponseError(400, 'Wajah tidak terdeteksi');

        const descriptor = detection.descriptor;
        const users = await prismaClient.user.findMany({
            where: { descriptor: { not: null } }
        });

        let bestMatch = null;
        let minDistance = 0.5;

        for (const user of users) {
            const storedDescriptor = new Float32Array(user.descriptor);
            const distance = faceapi.euclideanDistance(descriptor, storedDescriptor);

            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = user;
            }
        }

        fs.unlinkSync(req.file.path);

        if (bestMatch) {
            await prismaClient.attendance.create({
                data: {
                    username: bestMatch.username,
                    date: new Date(),
                    status: 'Hadir',
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                }
            });

            return res.status(200).json({
                message: 'Wajah cocok',
                user: {
                    name: bestMatch.name,
                    username: bestMatch.username,
                    status: 'Hadir',
                }
            });
        } else {
            return res.status(404).json({ message: 'Tidak ditemukan kecocokan wajah' });
        }
    } catch (error) {
        next(error);
    }
};
