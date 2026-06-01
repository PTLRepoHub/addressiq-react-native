require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'AddressIQLocation'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = 'https://addressiqpro.com'
  s.license      = { :type => 'UNLICENSED' }
  s.authors      = { 'AddressIQ' => 'engineering@addressiqpro.com' }
  s.platforms    = { :ios => '13.0' }
  s.source       = { :git => 'https://github.com/addressiq/sdk-react-native.git', :tag => "v#{s.version}" }

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version = '5.0'
  s.requires_arc = true

  s.dependency 'React-Core'
end
