#!/usr/bin/perl
# CGI-based Order API endpoint
# This is the legacy REST-ish API that handles order operations

use strict;
use warnings;
use CGI;
use JSON;
use DBI;
use lib '../lib';
use Order;
use Shipping;

my $cgi = CGI->new;
my $method = $ENV{REQUEST_METHOD} || 'GET';
my $path = $ENV{PATH_INFO} || '/';

# Database connection
my $dbh = DBI->connect(
    "dbi:mysql:dbname=tradeindia;host=localhost",
    "app_user",
    "secret_password",
    { RaiseError => 1, AutoCommit => 1 }
);

# Route handling
if ($path eq '/orders' && $method eq 'POST') {
    create_order();
} elsif ($path =~ m{^/orders/(\d+)$} && $method eq 'GET') {
    get_order($1);
} elsif ($path =~ m{^/orders/(\d+)/status$} && $method eq 'PUT') {
    update_order_status($1);
} elsif ($path eq '/shipping/calculate' && $method eq 'POST') {
    calculate_shipping();
} else {
    print $cgi->header(-status => '404', -type => 'application/json');
    print encode_json({ error => 'Not found' });
}

sub create_order {
    my $body = decode_json($cgi->param('POSTDATA') || '{}');
    
    my $order = Order->new(
        db_handle => $dbh,
        customer  => { id => $body->{customer_id} },
    );
    
    # Add items
    for my $item (@{$body->{items} || []}) {
        my $result = $order->add_item(
            product_id => $item->{product_id},
            name       => $item->{name},
            price      => $item->{price},
            quantity   => $item->{quantity},
        );
        
        unless ($result->{success}) {
            print $cgi->header(-status => '400', -type => 'application/json');
            print encode_json({ error => $result->{error} });
            return;
        }
    }
    
    # Process
    my $result = $order->process_order();
    
    if ($result->{success}) {
        print $cgi->header(-status => '201', -type => 'application/json');
        print encode_json($result);
    } else {
        print $cgi->header(-status => '400', -type => 'application/json');
        print encode_json({ error => $result->{error} });
    }
}

sub get_order {
    my ($order_id) = @_;
    
    my $sth = $dbh->prepare("SELECT * FROM orders WHERE id = ?");
    $sth->execute($order_id);
    my $order = $sth->fetchrow_hashref();
    
    if ($order) {
        print $cgi->header(-type => 'application/json');
        print encode_json($order);
    } else {
        print $cgi->header(-status => '404', -type => 'application/json');
        print encode_json({ error => "Order not found" });
    }
}

sub update_order_status {
    my ($order_id) = @_;
    my $body = decode_json($cgi->param('POSTDATA') || '{}');
    
    my $order = Order->new(
        db_handle => $dbh,
        order_id  => $order_id,
    );
    
    # Load current status from DB
    my $sth = $dbh->prepare("SELECT status FROM orders WHERE id = ?");
    $sth->execute($order_id);
    my ($current_status) = $sth->fetchrow_array();
    
    unless ($current_status) {
        print $cgi->header(-status => '404', -type => 'application/json');
        print encode_json({ error => "Order not found" });
        return;
    }
    
    $order->{status} = $current_status;
    my $result = $order->update_status($body->{status});
    
    if ($result->{success}) {
        $dbh->do("UPDATE orders SET status = ? WHERE id = ?", undef, $body->{status}, $order_id);
        print $cgi->header(-type => 'application/json');
        print encode_json($result);
    } else {
        print $cgi->header(-status => '400', -type => 'application/json');
        print encode_json({ error => $result->{error} });
    }
}

sub calculate_shipping {
    my $body = decode_json($cgi->param('POSTDATA') || '{}');
    
    my $shipping = Shipping->new(origin_pincode => '400001');
    my $result = $shipping->calculate_shipping(
        destination_pincode => $body->{destination_pincode},
        weight_kg          => $body->{weight_kg},
        order_value        => $body->{order_value},
        express            => $body->{express} || 0,
        fragile            => $body->{fragile} || 0,
    );
    
    print $cgi->header(-type => 'application/json');
    print encode_json($result);
}
