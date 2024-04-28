let net;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let monitoring = false;
let correctPoseData = null;

async function setupCamera() {
    video.width = 640;
    video.height = 480;
    navigator.mediaDevices.getUserMedia({
        video: true
    }).then(stream => {
        video.srcObject = stream;
    });
}

async function loadModel() {
    net = await posenet.load();
    console.log('loaded posenet');
}

async function detectPose() {
    const pose = await net.estimateSinglePose(video, {
        flipHorizontal: false
    });
    drawPose(pose);
}

function startCountdown(duration, display) {
    let timer = duration, minutes, seconds;
    const intervalId = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = minutes + ":" + seconds;

        if (--timer < 0) {
            clearInterval(intervalId);
            display.textContent = "Training complete!";
        }
    }, 1000);
    return intervalId;
}


function drawPose(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pose.score >= 0.5) {
        for (let keypoint of pose.keypoints) {
            if (keypoint.score >= 0.5) {
                const {y, x} = keypoint.position;
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }
}

document.getElementById('trainCorrect').addEventListener('click', async function() {
    const output = document.getElementById('output');
    output.textContent = 'Training for correct posture...';
    await new Promise(r => setTimeout(r, 5000)); 
    const pose = await net.estimateSinglePose(video, {flipHorizontal: false});
    correctPoseData = pose;
    output.textContent = 'Training for correct posture complete.';
});



let lastFeedback = "";
let feedbackUpdateTimer = null;

document.getElementById('toggleMonitor').addEventListener('click', function() {
    monitoring = !monitoring;
    const monitorOutput = document.getElementById('output');
    monitorOutput.textContent = `Monitoring ${monitoring ? 'enabled' : 'disabled'}.`;

    if (monitoring) {
        feedbackUpdateTimer = setInterval(async () => {
            const currentPose = await net.estimateSinglePose(video, {flipHorizontal: false});
            drawPose(currentPose);
            const feedback = comparePose(currentPose);
            if (feedback !== lastFeedback) {
                lastFeedback = feedback;
                monitorOutput.textContent = `Monitoring: ${feedback}`;
            }
        }, 500); 
    } else {
        clearInterval(feedbackUpdateTimer);
    }
});

function comparePose(currentPose) {
    if (!correctPoseData) return "No training data.";

    let upperBodyDeltas = [];
    let lowerBodyDeltas = [];
    const keypointsByRegion = {
        upperBody: ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow'],
        lowerBody: ['leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle']
    };

    currentPose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.5) {
            let referenceKeypoint = correctPoseData.keypoints.find(ref => ref.part === keypoint.part);
            if (referenceKeypoint && referenceKeypoint.score > 0.5) {
                const dx = keypoint.position.x - referenceKeypoint.position.x;
                const dy = keypoint.position.y - referenceKeypoint.position.y;
                if (keypointsByRegion.upperBody.includes(keypoint.part)) {
                    upperBodyDeltas.push({dx, dy});
                } else if (keypointsByRegion.lowerBody.includes(keypoint.part)) {
                    lowerBodyDeltas.push({dx, dy});
                }
            }
        }
    });

    return generateFeedback(upperBodyDeltas, lowerBodyDeltas);
}

function generateFeedback(upperBodyDeltas, lowerBodyDeltas) {
    let feedback = [];
    let upperThreshold = 20; 
    let lowerThreshold = 30; 

    let upperBodyAdjustment = getOverallAdjustment(upperBodyDeltas, upperThreshold);
    let lowerBodyAdjustment = getOverallAdjustment(lowerBodyDeltas, lowerThreshold);

    if (upperBodyAdjustment) feedback.push(upperBodyAdjustment);
    if (lowerBodyAdjustment) feedback.push(lowerBodyAdjustment);

    return feedback.length > 0 ? feedback.join(". ") + "." : "Pose is correct.";
}

function getOverallAdjustment(deltas, threshold) {
    let averageDx = deltas.reduce((acc, cur) => acc + cur.dx, 0) / deltas.length;
    let averageDy = deltas.reduce((acc, cur) => acc + cur.dy, 0) / deltas.length;

    if (Math.sqrt(averageDx * averageDx + averageDy * averageDy) > threshold) {
        let directionX = averageDx > 0 ? "move left" : "move right";
        let directionY = averageDy > 0 ? "move down" : "move up";
        return `${Math.abs(averageDy) > Math.abs(averageDx) ? directionY : directionX}`;
    }
    return null;
}



setupCamera().then(loadModel);
