Pod::Spec.new do |s|
  s.name           = 'BleShare'
  s.version        = '1.0.0'
  s.summary        = 'BLE proximity sharing module for NextVibe'
  s.description    = 'Expo native module that uses CoreBluetooth to broadcast and scan for profiles via BLE proximity'
  s.author         = 'NextVibe'
  s.homepage       = 'https://nextvibe.io'
  s.platforms      = { :ios => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.swift'
  s.frameworks = 'CoreBluetooth'
end
