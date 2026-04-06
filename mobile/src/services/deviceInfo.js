import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Location from 'expo-location';

export const collectDeviceInfo = async () => {
  const info = {
    device: {
      brand: Device.brand,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      deviceName: Device.deviceName,
      isDevice: Device.isDevice,
      totalMemory: Device.totalMemory,
    },
    battery: {},
    network: {},
    location: null,
  };

  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const batteryState = await Battery.getBatteryStateAsync();
    info.battery = {
      level: Math.round(batteryLevel * 100),
      charging: batteryState === Battery.BatteryState.CHARGING,
    };
  } catch (e) {
    info.battery = { level: null, charging: null };
  }

  try {
    const networkState = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();
    info.network = {
      isConnected: networkState.isConnected,
      type: networkState.type,
      isInternetReachable: networkState.isInternetReachable,
      ipAddress: ip,
    };
  } catch (e) {
    info.network = { isConnected: null, type: null };
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      info.location = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        altitude: loc.coords.altitude,
        accuracy: loc.coords.accuracy,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
        timestamp: loc.timestamp,
      };
    }
  } catch (e) {
    info.location = null;
  }

  return info;
};
