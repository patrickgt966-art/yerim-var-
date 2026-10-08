import ExpoModulesCore
import MapKit

/// Car parks near a point from Apple Maps (MKLocalPointsOfInterestRequest).
/// Runs on the device; Apple receives only the search region. Returns name,
/// coordinate and a one-line address. No occupancy, capacity or price.
public final class YerimMapKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YerimMapKit")

    AsyncFunction("searchParkingAsync") { (latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [[String: Any]] in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      // Apple caps the radius; keep it in a sane walking range.
      let radius = min(max(radiusMeters, 100), 5_000)
      let request = MKLocalPointsOfInterestRequest(center: center, radius: radius)
      request.pointOfInterestFilter = MKPointOfInterestFilter(including: [.parking])

      let response: MKLocalSearch.Response
      do {
        response = try await MKLocalSearch(request: request).start()
      } catch let error as MKError where error.code == .placemarkNotFound {
        // "Nothing here" is a normal answer, not a failure.
        return []
      }
      return response.mapItems.compactMap { item -> [String: Any]? in
        let coordinate = item.placemark.coordinate
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
        let placemark = item.placemark
        let address = [placemark.thoroughfare, placemark.subThoroughfare, placemark.locality]
          .compactMap { $0 }
          .joined(separator: " ")
        return [
          "name": item.name ?? "",
          "latitude": coordinate.latitude,
          "longitude": coordinate.longitude,
          "address": address,
        ]
      }
    }

    /// Free-text place search ("Sevil 2 İş Hanı", "Konak et restoranı"),
    /// biased to a region. Apple receives the query text and the region.
    AsyncFunction("searchPlacesAsync") { (query: String, latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [[String: Any]] in
      let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty { return [] }
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = text
      let span = min(max(radiusMeters, 1_000), 100_000) * 2
      request.region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        latitudinalMeters: span,
        longitudinalMeters: span
      )
      request.resultTypes = [.pointOfInterest, .address]

      let response: MKLocalSearch.Response
      do {
        response = try await MKLocalSearch(request: request).start()
      } catch let error as MKError where error.code == .placemarkNotFound {
        return []
      }
      return response.mapItems.prefix(10).compactMap { item -> [String: Any]? in
        let coordinate = item.placemark.coordinate
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
        let placemark = item.placemark
        let address = [placemark.thoroughfare, placemark.subThoroughfare, placemark.subLocality, placemark.locality]
          .compactMap { $0 }
          .joined(separator: " ")
        return [
          "name": item.name ?? "",
          "latitude": coordinate.latitude,
          "longitude": coordinate.longitude,
          "address": address,
          "phone": item.phoneNumber ?? "",
          "url": item.url?.absoluteString ?? "",
          "category": item.pointOfInterestCategory?.rawValue ?? "",
        ]
      }
    }
  }
}
