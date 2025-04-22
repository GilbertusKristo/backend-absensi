import fs from 'fs';
import path from 'path';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import canvas from 'canvas';
import { prismaClient } from '../application/database.js';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

await tf.setBackend('cpu');
await tf.ready();

const MODEL_PATH = path.join(process.cwd(), 'models');
await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH)
]);

export const registerFace = async (req, res, next) => {
    try {
        const username = req.user.username;
        
        const user = await prismaClient.user.findUnique({
            where: { username },
        });

        if (!user) {
            throw new ResponseError(404, "User not found");
        }

        const image = await canvas.loadImage(req.file.path);
        const detection = await faceapi
            .detectSingleFace(image)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new ResponseError(400, "Wajah tidak terdeteksi");
        }

        const descriptor = Array.from(detection.descriptor);

        
        const updatedUser = await prismaClient.user.update({
            where: { username },
            data: { descriptor },
            select: {
                username: true,
                name: true,
            },
        });

        res.status(201).json({
            message: "Face data registered successfully",
            data: updatedUser,
        });
    } catch (e) {
        next(e);
    }
};


export const matchFace = async (req, res, next) => {
    try {
        const image = await canvas.loadImage(req.file.path);
        const detection = await faceapi
            .detectSingleFace(image)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            return res.status(400).json({ error: 'Wajah tidak terdeteksi' });
        }

        const descriptor = detection.descriptor;
        const users = await prismaClient.user.findMany({
            where: {
                descriptor: {
                    not: null
                }
            }
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

        if (bestMatch) {
            await prismaClient.attendance.create({
                data: {
                    username: bestMatch.username,
                    date: new Date(),
                    status: 'Hadir'
                }
            });

            res.status(200).json({ message: 'Wajah cocok', user: {
                user: {
                    name: bestMatch.name,
                    username: bestMatch.username,
                    status: 'Hadir',
                }
            } });
        } else {
            res.status(404).json({ message: 'Tidak ditemukan kecocokan wajah' });
        }
    } catch (error) {
        next(error);
    }
};
