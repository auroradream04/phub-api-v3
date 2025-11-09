<?php
/**
 * Extract MACCMS collection debug logs from PHP error log
 * Usage: php extract-maccms-logs.php /path/to/error.log
 *
 * This script:
 * - Reads the PHP error log
 * - Extracts only COLLECT DEBUG lines
 * - Cleans encoding issues
 * - Outputs in readable format
 * - Saves to clean-logs.txt for viewing
 */

if (empty($argv[1])) {
    echo "Usage: php extract-maccms-logs.php <path-to-error-log>\n";
    echo "Example: php extract-maccms-logs.php /var/log/php-errors.log\n";
    exit(1);
}

$logFile = $argv[1];

if (!file_exists($logFile)) {
    echo "Error: Log file not found: $logFile\n";
    exit(1);
}

echo "Reading log file: $logFile\n";
echo "Extracting COLLECT DEBUG lines...\n\n";

$handle = fopen($logFile, 'r');
if (!$handle) {
    echo "Error: Cannot open log file\n";
    exit(1);
}

$output = [];
$videoCount = 0;
$currentVideo = null;

while (($line = fgets($handle)) !== false) {
    // Skip lines without COLLECT DEBUG
    if (strpos($line, 'COLLECT DEBUG') === false) {
        continue;
    }

    // Extract the debug message
    preg_match('/PHP message: (\[COLLECT DEBUG\].+?)(?:;|$)/', $line, $matches);

    if (!empty($matches[1])) {
        $message = $matches[1];

        // Clean encoding issues - convert to UTF-8, removing invalid sequences
        $message = mb_convert_encoding($message, 'UTF-8', 'UTF-8');
        $message = iconv('UTF-8', 'UTF-8//IGNORE', $message);

        // Track videos for grouping
        if (strpos($message, 'VIDEO MATCHING LOGIC') !== false) {
            $videoCount++;
            $output[] = "\n" . str_repeat("=", 80);
            $output[] = "VIDEO #$videoCount";
            $output[] = str_repeat("=", 80);
        }

        $output[] = $message;
    }
}

fclose($handle);

if (empty($output)) {
    echo "No COLLECT DEBUG logs found in file.\n";
    exit(0);
}

// Print to console
echo str_repeat("=", 80) . "\n";
echo "MACCMS COLLECTION DEBUG LOGS\n";
echo str_repeat("=", 80) . "\n";
foreach ($output as $line) {
    echo $line . "\n";
}

// Also save to file for easy viewing
$outputFile = dirname($logFile) . '/maccms-clean-logs.txt';
file_put_contents($outputFile, implode("\n", $output));
echo "\n" . str_repeat("=", 80) . "\n";
echo "Saved to: $outputFile\n";
echo "Total videos processed: $videoCount\n";
