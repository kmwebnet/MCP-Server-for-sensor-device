#!/usr/bin/env node
import * as readline from 'readline';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { log } from 'console';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Error codes for JSON-RPC
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["ParseError"] = -32700] = "ParseError";
    ErrorCode[ErrorCode["InvalidRequest"] = -32600] = "InvalidRequest";
    ErrorCode[ErrorCode["MethodNotFound"] = -32601] = "MethodNotFound";
    ErrorCode[ErrorCode["InvalidParams"] = -32602] = "InvalidParams";
    ErrorCode[ErrorCode["InternalError"] = -32603] = "InternalError";
})(ErrorCode || (ErrorCode = {}));

// Function to log text to a file
const log2text = (message) => {
    const logFilePath = path.join(os.homedir(), 'co2_level.log');
    fs.appendFile(logFilePath, message + '\n', (err) => {
        if (err) {
            console.error(`Error writing to log file: ${err.message}`);
        }
    });
};

// Simulated device state
class DeviceState {
    constructor() {
        // Device information
        this.deviceId = 'rpipico-' + Math.floor(Math.random() * 0xffff).toString(16);
        this.firmwareVersion = '1.0.0';
        this.bootTime = new Date();
        this.dataHandlerSet = false;
        // Sensor data
        this.co2Level = 0;
        this.lastSensorUpdate = new Date();
        // Network status
        this.wifiConnected = true;
        this.wifiSSID = 'SimulatedWiFi';
        this.ipAddress = '192.168.1.' + Math.floor(Math.random() * 255);
        // MQTT status
        this.mqttConnected = true;
        this.mqttBroker = '192.168.1.100';
        this.mqttPort = 1883;
        this.mqttTopic = 'sensor/1';
        // Power management
        this.batteryLevel = 85; // percentage
        // Simulate sensor data changes
        setInterval(() => {
            this.updateSensorData();
        }, 5000);
    }

    handleData(data) {
        const dataStr = data.toString().trim();
        const match = dataStr.match(/CO2 \(ppm\):(\d+)/);
        if (match) {
            const value = parseInt(match[1]);
            if (!isNaN(value) && value > 0) {
                this.co2Level = value;
            }
        }
    }

    async initializePort() {
        try {
            const ports = await SerialPort.list();
            // Search for Raspberry Pi Pico USB serial port
            const portInfo = ports.find(port => port.vendorId === '2E8A' && port.productId === '0005');
            if (portInfo) {
                // Create a serial port connection
                this.port = new SerialPort({ path: portInfo.path, baudRate: 115200 });
                this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
                this.parser.on('data', this.handleData.bind(this));
                this.dataHandlerSet = true;
            } else {
                console.log('No USB serial port found, running in simulation mode');
                this.port = null;
            }
        } catch (err) {
            console.error(`Error listing serial ports: ${err.message}`);
            console.log('Running in simulation mode due to error');
            this.port = null;
        }
    }

    updateSensorData = () => {
        // Simulate data if no serial port is available
        if (!this.port) {
            this.co2Level = Math.floor(400 + Math.random() * 600);
        }

        this.lastSensorUpdate = new Date();
        // Simulate battery drain
        this.batteryLevel = Math.max(0, this.batteryLevel - 0.1);
    }

    // Getters for device information
    getDeviceInfo() {
        return {
            deviceId: this.deviceId,
            firmwareVersion: this.firmwareVersion,
            bootTime: this.bootTime.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            uptime: Math.floor((new Date().getTime() - this.bootTime.getTime()) / 1000),
            batteryLevel: this.batteryLevel,
        };
    }

    // Getters for sensor data
    async getSensorData() {
        if (!this.port && !this.dataHandlerSet) {
            await this.initializePort();
        }

        return new Promise((resolve, reject) => {
            // Maximum wait time for data (milliseconds)
            const maxWaitTime = 5000;
            // Timer ID for timeout
            let timeoutId;

            // If a serial port is available
            if (this.port) {
                log2text(`sensor data requested - waiting for data...`);

                // Event handler to wait for data
                const dataHandler = (data) => {
                    this.handleData(data);
                    if (this.co2Level > 0) {
                        this.lastSensorUpdate = new Date();

                        // Clear the timeout
                        clearTimeout(timeoutId);
                        // Remove the event listener
                        this.parser.removeListener('data', dataHandler);
                        log2text(`sensor data received: ${this.co2Level}`);
                        // Return the result
                        resolve({
                            co2Level: this.co2Level,
                            lastUpdate: this.lastSensorUpdate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                            status: "data_received"
                        });
                    }
                };

                // Add event listener to wait for data
                this.parser.on('data', dataHandler);

                // Timeout processing
                timeoutId = setTimeout(() => {
                    // Remove the event listener
                    this.parser.removeListener('data', dataHandler);

                    // Use simulated data on timeout
                    this.co2Level = Math.floor(400 + Math.random() * 600);
                    this.lastSensorUpdate = new Date();
                    log2text(`sensor data wait timeout - using simulated value: ${this.co2Level}`);
                    resolve({
                        co2Level: this.co2Level,
                        lastUpdate: this.lastSensorUpdate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        status: "timeout_simulated_data"
                    });
                }, maxWaitTime);

                // Send data request (if needed)
                this.port.write('getdata\r\n', (err) => {
                    if (err) {
                        log2text(`Error requesting data: ${err.message}`);
                        // Do not reject, handle with timeout
                    }
                });
            }
            // If in simulation mode
            else {
                // Update if in simulation mode
                if (!this.port) {
                    this.updateSensorData();
                }

                log2text(`sensor data requested: ${this.co2Level}`);

                // Return the result
                resolve({
                    co2Level: this.co2Level,
                    lastUpdate: this.lastSensorUpdate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    status: "simulated_data"
                });
            }
        });
    }

    // Getters for network status
    getNetworkStatus() {
        return {
            wifiConnected: this.wifiConnected,
            wifiSSID: this.wifiSSID,
            ipAddress: this.ipAddress,
            mqttConnected: this.mqttConnected,
            mqttBroker: this.mqttBroker,
            mqttPort: this.mqttPort,
            mqttTopic: this.mqttTopic
        };
    }

    // Method to simulate publishing data to MQTT
    publishToMQTT() {
        if (!this.mqttConnected) {
            return {
                success: false,
                message: 'MQTT not connected'
            };
        }
        const data = `${this.co2Level}`;
        return {
            success: true,
            topic: this.mqttTopic,
            data: data,
            timestamp: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
    }

    // Method to simulate WiFi reconnection
    reconnectWiFi() {
        // Simulate connection process
        this.wifiConnected = false;
        setTimeout(() => {
            this.wifiConnected = true;
            this.ipAddress = '192.168.1.' + Math.floor(Math.random() * 255);
        }, 2000);
        return {
            success: true,
            message: 'WiFi reconnection initiated'
        };
    }

    // Method to simulate MQTT reconnection
    reconnectMQTT() {
        if (!this.wifiConnected) {
            return {
                success: false,
                message: 'WiFi not connected'
            };
        }
        // Simulate connection process
        this.mqttConnected = false;
        setTimeout(() => {
            this.mqttConnected = true;
        }, 1500);
        return {
            success: true,
            message: 'MQTT reconnection initiated'
        };
    }
}

// Simple MCP Server implementation
class McpServer {
    constructor() {
        this.nextId = 1;
        this.deviceState = new DeviceState();
        // Create readline interface for stdin/stdout
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
        // Listen for incoming messages
        this.rl.on('line', (line) => {
            try {
                this.handleMessage(line);
            } catch (error) {
                // Handle error
            }
        });
        // Handle process termination
        process.on('SIGINT', () => {
            this.close();
            process.exit(0);
        });
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            // Handle error
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            // Handle error
        });
        // Send server info
        this.sendServerInfo();
    }

    sendServerInfo() {
        const serverInfo = {
            jsonrpc: '2.0',
            method: 'server/info',
            params: {
                name: 'device-sensor',
                version: '1.0.0',
                capabilities: {
                    resources: {
                        supportsResourceTemplates: false,
                        supportsResourceSearch: false
                    },
                    tools: {
                        supportsToolSearch: false
                    }
                }
            }
        };
        console.log(JSON.stringify(serverInfo));
    }

    handleMessage(message) {
        try {
            const request = JSON.parse(message);
            // Check if it's a valid JSON-RPC request
            if (request.jsonrpc !== '2.0') {
                this.sendError(request.id, ErrorCode.InvalidRequest, 'Invalid Request: missing jsonrpc version');
                return;
            }
            // Check if the method is missing
            if (!request.method) {
                this.sendError(request.id, ErrorCode.InvalidRequest, 'Invalid Request: missing method');
                return;
            }
            // Determine if this is a notification (no id) or a request (with id)
            const isNotification = request.id === undefined || request.id === null;
            if (isNotification) {
                // Handle notifications (no id)
                switch (request.method) {
                    case 'notifications/cancelled':
                        break;
                    case 'exit':
                        this.close();
                        process.exit(0);
                        break;
                    default:
                        break;
                }
            } else {
                // Handle requests with IDs
                switch (request.method) {
                    case 'initialize':
                        this.handleInitialize(request);
                        break;
                    case 'shutdown':
                        this.handleShutdown(request);
                        break;
                    case 'resources/list':
                        this.handleListResources(request);
                        break;
                    case 'resources/read':
                        this.handleReadResource(request);
                        break;
                    case 'tools/list':
                        this.handleListTools(request);
                        break;
                    case 'tools/call':
                        this.handleCallTool(request);
                        break;
                    default:
                        // For unknown methods, just return an empty success response
                        // This helps prevent timeouts
                        this.sendResponse(request.id, {});
                        break;
                }
            }
        } catch (error) {
            this.sendError(null, ErrorCode.ParseError, 'Parse error');
        }
    }

    handleListResources(request) {
        const resources = [
            {
                uri: 'device://device/info',
                name: ' Device Information',
                mimeType: 'application/json',
                description: 'Basic information about the device including ID, firmware version, and uptime'
            },
            {
                uri: 'device://sensor/data',
                name: 'MH-Z19B Sensor Data',
                mimeType: 'application/json',
                description: 'Current CO2 ppm readings from the MH-Z19B sensor'
            },
            {
                uri: 'device://network/status',
                name: 'Network Connection Status',
                mimeType: 'application/json',
                description: 'WiFi and MQTT connection status information'
            }
        ];
        this.sendResponse(request.id, { resources });
    }

    async handleReadResource(request) {
        const uri = request.params?.uri;
        if (!uri) {
            this.sendError(request.id, ErrorCode.InvalidParams, 'Invalid params');
            return;
        }
        let content;
        switch (uri) {
            case 'device://device/info':
                content = JSON.stringify(this.deviceState.getDeviceInfo(), null, 2);
                break;
            case 'device://sensor/data':
                const sensorData = await this.deviceState.getSensorData();
                content = JSON.stringify(sensorData, null, 2);
                break;
            case 'device://network/status':
                content = JSON.stringify(this.deviceState.getNetworkStatus(), null, 2);
                break;
            default:
                this.sendError(request.id, ErrorCode.InvalidParams, 'Invalid resource URI');
                return;
        }
        this.sendResponse(request.id, {
            contents: [
                {
                    uri: uri,
                    mimeType: 'application/json',
                    text: content
                }
            ]
        });
    }

    handleListTools(request) {
        const tools = [
            {
                name: 'get_sensor_data',
                description: 'Get current CO2 ppm readings from the MH-Z19B sensor',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_device_info',
                description: 'Get information about the device',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_network_status',
                description: 'Get WiFi and MQTT connection status (NOT IMPLEMENTED)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'publish_mqtt_data',
                description: 'Publish current sensor data to the MQTT topic (NOT IMPLEMENTED)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'reconnect_wifi',
                description: 'Force the device to reconnect to WiFi (NOT IMPLEMENTED)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'reconnect_mqtt',
                description: 'Force the device to reconnect to the MQTT broker (NOT IMPLEMENTED)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        ];
        this.sendResponse(request.id, { tools });
    }

    handleCallTool(request) {
        const toolName = request.params?.name;
        const args = request.params?.arguments || {};
        if (!toolName) {
            this.sendError(request.id, ErrorCode.InvalidParams, 'Invalid params');
            return;
        }
        let result;
        try {
            switch (toolName) {
                case 'get_sensor_data':
                    // Handle asynchronous processing
                    this.deviceState.getSensorData()
                        .then(result => {
                            this.sendResponse(request.id, {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }
                                ]
                            });
                        })
                        .catch(error => {
                            this.sendError(request.id, ErrorCode.InternalError, 'Internal error');
                        });
                    return; // Early return for asynchronous processing
                case 'get_device_info':
                    result = this.deviceState.getDeviceInfo();
                    break;
                case 'get_network_status':
                    result = this.deviceState.getNetworkStatus();
                    break;
                case 'publish_mqtt_data':
                    result = this.deviceState.publishToMQTT();
                    break;
                case 'reconnect_wifi':
                    result = this.deviceState.reconnectWiFi();
                    break;
                case 'reconnect_mqtt':
                    result = this.deviceState.reconnectMQTT();
                    break;
                default:
                    this.sendError(request.id, ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
                    return;
            }
            this.sendResponse(request.id, {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            });
        } catch (error) {
            this.sendError(request.id, ErrorCode.InternalError, 'Internal error');
        }
    }

    sendResponse(id, result) {
        // Make sure we use the exact same ID from the request
        // Don't use this.nextId++ as a fallback
        const response = {
            jsonrpc: '2.0',
            id: id !== null ? id : 0, // Use 0 as fallback instead of this.nextId++
            result
        };
        console.log(JSON.stringify(response));
    }

    handleInitialize(request) {
        // Respond with server capabilities
        // Make sure the server name matches the name in Claude Desktop config
        this.sendResponse(request.id, {
            serverInfo: {
                name: 'co2-sensor', // Changed to match the name in Claude Desktop config
                version: '1.0.0'
            },
            capabilities: {
                resources: {
                    supportsResourceTemplates: false,
                    supportsResourceSearch: false
                },
                tools: {
                    supportsToolSearch: false
                }
            },
            protocolVersion: request.params.protocolVersion || '2024-11-05'
        });
    }

    handleShutdown(request) {
        // Respond with success
        this.sendResponse(request.id, {});
        // Don't exit immediately, wait a bit to ensure the response is sent
        setTimeout(() => {
            this.close();
            process.exit(0);
        }, 100);
    }

    sendError(id, code, message) {
        const response = {
            jsonrpc: '2.0',
            id: id !== null ? id : 0, // Use 0 as fallback instead of this.nextId++
            error: {
                code,
                message
            }
        };
        console.log(JSON.stringify(response));
    }

    close() {
        this.rl.close();
    }
}

// Start the server
const server = new McpServer();