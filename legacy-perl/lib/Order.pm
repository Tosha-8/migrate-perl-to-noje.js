package Order;

use strict;
use warnings;
use DBI;
use POSIX qw(strftime);
use List::Util qw(sum);

# Business Logic: Order processing for Trade India marketplace
# This module handles order creation, pricing, tax calculation,
# discount application, and status management.

sub new {
    my ($class, %args) = @_;
    my $self = bless {
        db_handle => $args{db_handle},
        order_id  => $args{order_id} || undef,
        items     => [],
        status    => 'pending',
        customer  => $args{customer} || {},
    }, $class;
    return $self;
}

# Calculate total with complex discount tiers
# Business Rule: 
#   - Orders > 10000 INR get 15% discount
#   - Orders > 5000 INR get 10% discount  
#   - Orders > 2000 INR get 5% discount
#   - Repeat customers (>5 orders) get additional 3% loyalty discount
#   - GST is applied AFTER discounts at 18%
sub calculate_total {
    my ($self) = @_;
    
    my $subtotal = sum(map { $_->{price} * $_->{quantity} } @{$self->{items}});
    $subtotal = 0 unless defined $subtotal;
    
    # Tiered discount
    my $discount_pct = 0;
    if ($subtotal > 10000) {
        $discount_pct = 15;
    } elsif ($subtotal > 5000) {
        $discount_pct = 10;
    } elsif ($subtotal > 2000) {
        $discount_pct = 5;
    }
    
    # Loyalty discount for repeat customers
    my $loyalty_discount = 0;
    if ($self->_get_customer_order_count() > 5) {
        $loyalty_discount = 3;
    }
    
    my $total_discount = $discount_pct + $loyalty_discount;
    my $discounted = $subtotal * (1 - $total_discount / 100);
    
    # GST at 18%
    my $gst = $discounted * 0.18;
    my $total = $discounted + $gst;
    
    return {
        subtotal       => sprintf("%.2f", $subtotal),
        discount_pct   => $total_discount,
        discount_amt   => sprintf("%.2f", $subtotal - $discounted),
        gst            => sprintf("%.2f", $gst),
        total          => sprintf("%.2f", $total),
    };
}

# Add item with inventory validation
sub add_item {
    my ($self, %item) = @_;
    
    # Validate required fields
    die "Item must have a product_id" unless $item{product_id};
    die "Item must have a price" unless defined $item{price} && $item{price} > 0;
    die "Item must have a quantity" unless defined $item{quantity} && $item{quantity} > 0;
    
    # Check inventory
    my $available = $self->_check_inventory($item{product_id});
    if ($available < $item{quantity}) {
        return { success => 0, error => "Insufficient inventory. Available: $available" };
    }
    
    push @{$self->{items}}, {
        product_id => $item{product_id},
        name       => $item{name} || 'Unknown Product',
        price      => $item{price},
        quantity   => $item{quantity},
    };
    
    return { success => 1 };
}

# Process order - validates, saves, sends notification
sub process_order {
    my ($self) = @_;
    
    # Validation
    return { success => 0, error => "No items in order" } 
        unless scalar @{$self->{items}} > 0;
    
    return { success => 0, error => "Customer information required" }
        unless $self->{customer}{id};
    
    # Check if customer is blacklisted
    if ($self->_is_customer_blacklisted($self->{customer}{id})) {
        return { success => 0, error => "Customer account suspended" };
    }
    
    my $totals = $self->calculate_total();
    
    # Credit limit check
    if ($totals->{total} > $self->_get_credit_limit($self->{customer}{id})) {
        return { success => 0, error => "Order exceeds credit limit" };
    }
    
    # Save to database
    my $order_id = $self->_save_order($totals);
    
    # Update inventory
    $self->_deduct_inventory();
    
    # Send notification
    $self->_send_order_notification($order_id);
    
    $self->{order_id} = $order_id;
    $self->{status} = 'confirmed';
    
    return { 
        success  => 1, 
        order_id => $order_id,
        totals   => $totals,
        status   => 'confirmed',
    };
}

# Status transition with validation
# Valid transitions: pending->confirmed->shipped->delivered
#                    pending->cancelled
#                    confirmed->cancelled (with restocking)
sub update_status {
    my ($self, $new_status) = @_;
    
    my %valid_transitions = (
        'pending'   => ['confirmed', 'cancelled'],
        'confirmed' => ['shipped', 'cancelled'],
        'shipped'   => ['delivered'],
        'delivered' => [],
        'cancelled' => [],
    );
    
    my $current = $self->{status};
    my @allowed = @{$valid_transitions{$current} || []};
    
    unless (grep { $_ eq $new_status } @allowed) {
        return { 
            success => 0, 
            error   => "Cannot transition from '$current' to '$new_status'" 
        };
    }
    
    # If cancelling a confirmed order, restock items
    if ($new_status eq 'cancelled' && $current eq 'confirmed') {
        $self->_restock_items();
    }
    
    $self->{status} = $new_status;
    $self->_log_status_change($current, $new_status);
    
    return { success => 1, status => $new_status };
}

# Private methods
sub _get_customer_order_count {
    my ($self) = @_;
    return 0 unless $self->{customer}{id};
    my $sth = $self->{db_handle}->prepare(
        "SELECT COUNT(*) FROM orders WHERE customer_id = ?"
    );
    $sth->execute($self->{customer}{id});
    my ($count) = $sth->fetchrow_array();
    return $count || 0;
}

sub _check_inventory {
    my ($self, $product_id) = @_;
    my $sth = $self->{db_handle}->prepare(
        "SELECT quantity_available FROM inventory WHERE product_id = ?"
    );
    $sth->execute($product_id);
    my ($qty) = $sth->fetchrow_array();
    return $qty || 0;
}

sub _is_customer_blacklisted {
    my ($self, $customer_id) = @_;
    my $sth = $self->{db_handle}->prepare(
        "SELECT is_blacklisted FROM customers WHERE id = ?"
    );
    $sth->execute($customer_id);
    my ($blacklisted) = $sth->fetchrow_array();
    return $blacklisted ? 1 : 0;
}

sub _get_credit_limit {
    my ($self, $customer_id) = @_;
    my $sth = $self->{db_handle}->prepare(
        "SELECT credit_limit FROM customers WHERE id = ?"
    );
    $sth->execute($customer_id);
    my ($limit) = $sth->fetchrow_array();
    return $limit || 50000;  # Default 50000 INR
}

sub _save_order {
    my ($self, $totals) = @_;
    my $sth = $self->{db_handle}->prepare(
        "INSERT INTO orders (customer_id, subtotal, discount, gst, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $sth->execute(
        $self->{customer}{id},
        $totals->{subtotal},
        $totals->{discount_amt},
        $totals->{gst},
        $totals->{total},
        'confirmed',
        strftime("%Y-%m-%d %H:%M:%S", localtime),
    );
    return $self->{db_handle}->{mysql_insertid};
}

sub _deduct_inventory {
    my ($self) = @_;
    for my $item (@{$self->{items}}) {
        my $sth = $self->{db_handle}->prepare(
            "UPDATE inventory SET quantity_available = quantity_available - ? WHERE product_id = ?"
        );
        $sth->execute($item->{quantity}, $item->{product_id});
    }
}

sub _restock_items {
    my ($self) = @_;
    for my $item (@{$self->{items}}) {
        my $sth = $self->{db_handle}->prepare(
            "UPDATE inventory SET quantity_available = quantity_available + ? WHERE product_id = ?"
        );
        $sth->execute($item->{quantity}, $item->{product_id});
    }
}

sub _send_order_notification {
    my ($self, $order_id) = @_;
    # Integration with email/SMS service
    # In production, this calls an external API
    return 1;
}

sub _log_status_change {
    my ($self, $from, $to) = @_;
    my $sth = $self->{db_handle}->prepare(
        "INSERT INTO order_status_log (order_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)"
    );
    $sth->execute($self->{order_id}, $from, $to, strftime("%Y-%m-%d %H:%M:%S", localtime));
}

1;
