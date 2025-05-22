#!/usr/bin/env python3
import cv2
import numpy as np
import argparse
import sys
import time
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

def detect_motion(sensitivity):
    logger.info(f"Starting motion detection with sensitivity: {sensitivity}")
    
    # Initialize webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        logger.error("Could not open webcam")
        sys.exit(1)

    logger.info("Webcam opened successfully")

    # Read first frame
    ret, frame1 = cap.read()
    if not ret:
        logger.error("Could not read first frame")
        sys.exit(1)

    logger.info("First frame captured successfully")

    # Convert to grayscale
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray1 = cv2.GaussianBlur(gray1, (21, 21), 0)

    # Convert sensitivity (1-100) to threshold (100000-20000)
    # Higher threshold means less sensitive
    # This range is more appropriate for detecting significant motion
    threshold = 100000 - (sensitivity * 800)
    logger.info(f"Motion threshold set to: {threshold}")

    # Add minimum motion threshold to ignore tiny movements
    min_motion_threshold = 50000  # Minimum amount of motion required
    logger.info(f"Minimum motion threshold: {min_motion_threshold}")

    frame_count = 0
    last_log_time = time.time()
    last_motion_time = 0
    motion_cooldown = 2  # seconds between motion detections
    consecutive_motion_frames = 0  # Count consecutive frames with motion
    required_consecutive_frames = 3  # Number of consecutive frames needed to trigger

    try:
        while True:
            # Read next frame
            ret, frame2 = cap.read()
            if not ret:
                logger.error("Could not read frame")
                break

            # Convert to grayscale
            gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.GaussianBlur(gray2, (21, 21), 0)

            # Calculate difference between frames
            frame_diff = cv2.absdiff(gray1, gray2)
            thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)

            # Calculate motion
            motion = np.sum(thresh) / 255

            # Log frame rate and motion level every 5 seconds
            frame_count += 1
            current_time = time.time()
            if current_time - last_log_time >= 5:
                fps = frame_count / (current_time - last_log_time)
                logger.info(f"FPS: {fps:.1f}, Current motion level: {motion:.1f}, Threshold: {threshold}")
                frame_count = 0
                last_log_time = current_time

            # Check for significant motion
            if motion > min_motion_threshold and motion > threshold:
                consecutive_motion_frames += 1
                if consecutive_motion_frames >= required_consecutive_frames and (current_time - last_motion_time) >= motion_cooldown:
                    logger.info(f"Significant motion detected! Level: {motion:.1f}, Threshold: {threshold}")
                    print("MOTION_DETECTED")
                    sys.stdout.flush()
                    last_motion_time = current_time
            else:
                consecutive_motion_frames = 0  # Reset counter if motion is below threshold

            # Update previous frame
            gray1 = gray2

            # Small delay to reduce CPU usage
            time.sleep(0.1)

    except KeyboardInterrupt:
        logger.info("Motion detection stopped by user")
    except Exception as e:
        logger.error(f"Error in motion detection: {str(e)}")
    finally:
        logger.info("Cleaning up and releasing webcam")
        cap.release()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Motion Detection Script')
    parser.add_argument('--sensitivity', type=int, default=50,
                      help='Motion detection sensitivity (1-100)')
    args = parser.parse_args()

    # Ensure sensitivity is within bounds
    sensitivity = max(1, min(100, args.sensitivity))
    logger.info(f"Starting motion detection script with sensitivity: {sensitivity}")
    detect_motion(sensitivity) 