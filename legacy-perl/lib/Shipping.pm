package Shipping;

use strict;
use warnings;
use POSIX qw(ceil);
use JSON;

# Shipping rate calculation for Trade India marketplace
# Handles domestic and international shipping with zone-based pricing

my %ZONE_RATES = (
    'local'    => { base => 40,  per_kg => 10, free_above => 500 },
    'regional' => { base => 70,  per_kg => 20, free_above => 1000 },
    'national' => { base => 120, per_kg => 35, free_above => 2000 },
    'international' => { base => 500, per_kg => 150, free_above => 0 },  # Never free
);

my %PINCODE_ZONES = (
    # Same city (Mumbai)
    '400001-400099' => 'local',
    # Maharashtra
    '400100-445999' => 'regional',
    # Rest of India
    '100000-999999' => 'national',
);

sub new {
    my ($class, %args) = @_;
    return bless {
        origin_pincode => $args{origin_pincode} || '400001',
        weight_unit    => $args{weight_unit} || 'kg',
    }, $class;
}

# Calculate shipping cost based on destination and weight
sub calculate_shipping {
    my ($self, %params) = @_;
    
    my $dest_pincode = $params{destination_pincode};
    my $weight       = $params{weight_kg} || 0;
    my $order_value  = $params{order_value} || 0;
    my $express      = $params{express} || 0;
    
    # Determine zone
    my $zone = $self->_get_zone($dest_pincode);
    
    unless ($zone) {
        return { success => 0, error => "Invalid destination pincode: $dest_pincode" };
    }
    
    my $rates = $ZONE_RATES{$zone};
    
    # Check if eligible for free shipping
    if ($rates->{free_above} > 0 && $order_value >= $rates->{free_above}) {
        return {
            success  => 1,
            cost     => 0,
            zone     => $zone,
            free     => 1,
            delivery_days => $self->_estimate_delivery($zone, $express),
        };
    }
    
    # Calculate cost
    my $weight_rounded = ceil($weight);  # Round up to nearest kg
    my $cost = $rates->{base} + ($weight_rounded * $rates->{per_kg});
    
    # Express surcharge: 50% extra
    if ($express) {
        $cost = $cost * 1.5;
    }
    
    # Fragile items surcharge
    if ($params{fragile}) {
        $cost += 100;
    }
    
    return {
        success       => 1,
        cost          => sprintf("%.2f", $cost),
        zone          => $zone,
        free          => 0,
        delivery_days => $self->_estimate_delivery($zone, $express),
        breakdown     => {
            base_charge    => $rates->{base},
            weight_charge  => $weight_rounded * $rates->{per_kg},
            express_charge => $express ? sprintf("%.2f", $cost / 3) : 0,
            fragile_charge => $params{fragile} ? 100 : 0,
        },
    };
}

# Estimate delivery days
sub _estimate_delivery {
    my ($self, $zone, $express) = @_;
    
    my %base_days = (
        'local'         => 2,
        'regional'      => 4,
        'national'      => 7,
        'international' => 14,
    );
    
    my $days = $base_days{$zone} || 7;
    $days = ceil($days / 2) if $express;
    
    return $days;
}

# Determine shipping zone from pincode
sub _get_zone {
    my ($self, $pincode) = @_;
    
    return undef unless $pincode && $pincode =~ /^\d{6}$/;
    
    # Check international (non-Indian pincodes)
    return 'international' if length($pincode) != 6;
    
    my $pin_num = int($pincode);
    
    # Local: same city range
    return 'local' if $pin_num >= 400001 && $pin_num <= 400099;
    
    # Regional: same state
    return 'regional' if $pin_num >= 400100 && $pin_num <= 445999;
    
    # National: rest of India
    return 'national' if $pin_num >= 100000 && $pin_num <= 999999;
    
    return undef;
}

# Bulk shipping discount for B2B orders
sub calculate_bulk_discount {
    my ($self, %params) = @_;
    
    my $total_weight = $params{total_weight_kg} || 0;
    my $num_packages = $params{num_packages} || 1;
    
    my $discount_pct = 0;
    
    if ($total_weight > 100) {
        $discount_pct = 20;
    } elsif ($total_weight > 50) {
        $discount_pct = 15;
    } elsif ($total_weight > 20) {
        $discount_pct = 10;
    }
    
    # Additional discount for multiple packages
    if ($num_packages > 10) {
        $discount_pct += 5;
    }
    
    return { discount_pct => $discount_pct };
}

1;
