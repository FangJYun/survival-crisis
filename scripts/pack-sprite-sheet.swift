import CoreGraphics
import Foundation
import ImageIO

let arguments = CommandLine.arguments
guard arguments.count == 3,
      let input = CGImageSourceCreateWithURL(URL(fileURLWithPath: arguments[1]) as CFURL, nil),
      let sheet = CGImageSourceCreateImageAtIndex(input, 0, nil), sheet.width == sheet.height else {
    fatalError("用法：swift scripts/pack-sprite-sheet.swift 输入方形图集.png 输出图集.png")
}

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let alpha = CGImageAlphaInfo.premultipliedLast.rawValue
let cellSize = 320
let targetSize = cellSize * 4
let output = CGContext(data: nil, width: targetSize, height: targetSize, bitsPerComponent: 8,
                       bytesPerRow: targetSize * 4, space: space, bitmapInfo: alpha)!
output.interpolationQuality = .high

for row in 0..<4 {
    for column in 0..<4 {
        let left = column * sheet.width / 4, top = row * sheet.height / 4
        let width = (column + 1) * sheet.width / 4 - left, height = (row + 1) * sheet.height / 4 - top
        let tile = sheet.cropping(to: CGRect(x: left, y: top, width: width, height: height))!
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                bytesPerRow: width * 4, space: space, bitmapInfo: alpha)!
        context.draw(tile, in: CGRect(x: 0, y: 0, width: width, height: height))
        let pixels = context.data!.assumingMemoryBound(to: UInt8.self)
        var visited = Array(repeating: false, count: width * height)
        var main = [Int]()
        for seed in visited.indices where !visited[seed] && pixels[seed * 4 + 3] >= 96 {
            var queue = [seed], cursor = 0
            visited[seed] = true
            while cursor < queue.count {
                let index = queue[cursor], x = index % width, y = index / width
                cursor += 1
                for nextY in max(0, y - 1)...min(height - 1, y + 1) {
                    for nextX in max(0, x - 1)...min(width - 1, x + 1) {
                        let next = nextY * width + nextX
                        if !visited[next] && pixels[next * 4 + 3] >= 96 {
                            visited[next] = true
                            queue.append(next)
                        }
                    }
                }
            }
            if queue.count > main.count { main = queue }
        }
        guard main.count > 1500 else { fatalError("第 \(row + 1) 行第 \(column + 1) 列无有效图像") }
        var mask = Array(repeating: false, count: width * height)
        var minX = width, minY = height, maxX = 0, maxY = 0
        for index in main {
            let x = index % width, y = index / width
            for nextY in max(0, y - 2)...min(height - 1, y + 2) {
                for nextX in max(0, x - 2)...min(width - 1, x + 2) where pixels[(nextY * width + nextX) * 4 + 3] > 0 {
                    mask[nextY * width + nextX] = true
                    minX = min(minX, nextX); minY = min(minY, nextY)
                    maxX = max(maxX, nextX); maxY = max(maxY, nextY)
                }
            }
        }
        for index in mask.indices where !mask[index] { pixels.advanced(by: index * 4).update(repeating: 0, count: 4) }
        let packedWidth = maxX - minX + 1, packedHeight = maxY - minY + 1
        let sprite = context.makeImage()!.cropping(to: CGRect(x: minX, y: minY, width: packedWidth, height: packedHeight))!
        let scale = min(278.0 / Double(packedWidth), 283.0 / Double(packedHeight))
        let drawWidth = Double(packedWidth) * scale, drawHeight = Double(packedHeight) * scale
        output.draw(sprite, in: CGRect(x: Double(column * cellSize) + (Double(cellSize) - drawWidth) / 2,
                                       y: Double(targetSize - (row + 1) * cellSize + 12), width: drawWidth, height: drawHeight))
    }
}

let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: arguments[2]) as CFURL,
                                                 "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(destination, output.makeImage()!, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("图集写入失败") }
