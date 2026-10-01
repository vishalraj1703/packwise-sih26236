import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/reference.dart';

const brand = Color(0xFF0F3D3E);
const accent = Color(0xFFF4C95D);

String inr(num x) {
  final s = x.round().toString();
  if (s.length <= 3) return '₹$s';
  final head = s.substring(0, s.length - 3), tail = s.substring(s.length - 3);
  final groups = <String>[];
  var h = head;
  while (h.length > 2) {
    groups.insert(0, h.substring(h.length - 2));
    h = h.substring(0, h.length - 2);
  }
  if (h.isNotEmpty) groups.insert(0, h);
  return '₹${groups.join(',')},$tail';
}

String kgText(num x) => x == x.roundToDouble() ? '${x.toInt()} kg' : '$x kg';

class FoodPhoto extends StatelessWidget {
  const FoodPhoto(this.commodityId, {super.key, this.size = 56, this.radius = 12});
  final String commodityId;
  final double size;
  final double radius;
  @override
  Widget build(BuildContext context) {
    final img = Reference.foodImage(commodityId);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: img == null
          ? Container(width: size, height: size, color: const Color(0xFFE3EFEE), child: const Icon(Icons.eco, color: brand))
          : Image.asset(img, width: size, height: size, fit: BoxFit.cover),
    );
  }
}

class PackPhoto extends StatelessWidget {
  const PackPhoto(this.structureId, {super.key, this.size = 56});
  final String structureId;
  final double size;
  @override
  Widget build(BuildContext context) {
    final img = Reference.packImage(structureId);
    if (img != null) {
      return ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.asset(img, width: size, height: size, fit: BoxFit.cover));
    }
    final icon = switch (Reference.structureFormat[structureId]) {
      'stand-up-pouch' => Icons.shopping_bag,
      'pillow-pouch' => Icons.local_mall,
      'jar' => Icons.kitchen,
      _ => Icons.inventory_2,
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: const Color(0xFFE3EFEE), borderRadius: BorderRadius.circular(10)),
      child: Icon(icon, color: brand, size: size * 0.55),
    );
  }
}

class SupportChip extends StatelessWidget {
  const SupportChip(this.support, {super.key});
  final String support;
  @override
  Widget build(BuildContext context) {
    final ok = support == 'supported';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: ok ? const Color(0xFFE3F4EA) : const Color(0xFFFDF1D6), borderRadius: BorderRadius.circular(20)),
      child: Text('${ok ? '✓' : '!'} ${T.t(ok ? 'supported' : 'conditional')}',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ok ? const Color(0xFF1D7A46) : const Color(0xFF8A5A00))),
    );
  }
}

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.warn = false});
  final String text;
  final bool warn;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: warn ? const Color(0xFFFDF1D6) : const Color(0xFFE6EFFB), borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: TextStyle(fontSize: 13, color: warn ? const Color(0xFF8A5A00) : const Color(0xFF1C5CAB))),
      );
}

/// "Packs like this in shops" — real products by visible format, with the honesty disclaimer.
class ShopExamples extends StatelessWidget {
  const ShopExamples(this.structureId, {super.key});
  final String structureId;
  @override
  Widget build(BuildContext context) {
    final ex = Reference.examplesFor(structureId);
    if (ex.isEmpty) return const SizedBox.shrink();
    return Card(
      color: const Color(0xFFF6F8F7),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(T.t('shops'), style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          for (final e in ex) ...[
            Text('${e['products']}${(e['brands'] as List).isNotEmpty ? ' — e.g. ${(e['brands'] as List).join(', ')}' : ''}',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('What you can see: ${(e['visible'] as List).join(' · ')}', style: const TextStyle(fontSize: 12)),
            Text(e['sameNeed'] as String, style: const TextStyle(fontSize: 12, color: Colors.black54)),
            const SizedBox(height: 6),
          ],
          Text(Reference.exampleDisclaimer, style: const TextStyle(fontSize: 11, color: Colors.black45)),
        ]),
      ),
    );
  }
}
